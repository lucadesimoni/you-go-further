import { Platform } from "react-native";
import { api } from "./api";
import type { HealthPlatformId, HealthSyncPayload, HealthSyncResult } from "./types";

/**
 * Apple Health / Android Health Connect.
 *
 * Neither platform has a server API — the samples only exist on the device, and
 * only an app the athlete has granted read access to can see them. So the phone
 * reads them here and posts them to `/api/health/sync`; validation, readiness
 * and the profile update all happen on the server, so the number the phone shows
 * is the number the web app shows.
 *
 * The native modules are optional dependencies, resolved at runtime:
 *
 *   iOS      expo-health-kit / @kingstinct/react-native-healthkit
 *   Android  react-native-health-connect
 *
 * They need a development build (they cannot work in Expo Go, and there is no
 * such thing on web), so everything below degrades to `available: false` and a
 * plain explanation rather than crashing. `setHealthSource()` exists so the read
 * step can be driven by a test double while the sync path stays the real one.
 */

/** Everything we ask a platform for, in our own shape. */
export interface HealthSource {
  platform: HealthPlatformId;
  displayName: string;
  /** Ask the OS for read permission. Returns false if the athlete declines. */
  requestPermission(): Promise<boolean>;
  /** Read the last `days` of samples. */
  read(days: number): Promise<Omit<HealthSyncPayload, "platform">>;
}

let override: HealthSource | null = null;

/** Inject a source (tests, or a future platform) instead of probing natively. */
export function setHealthSource(source: HealthSource | null): void {
  override = source;
}

/** Load a native module without letting a missing one become a crash. */
function optionalRequire(name: string): Record<string, unknown> | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const mod = (globalThis as { require?: (n: string) => unknown }).require?.(name) ?? require(name);
    return (mod as { default?: Record<string, unknown> })?.default ?? (mod as Record<string, unknown>);
  } catch {
    return null;
  }
}

const iso = (d: Date) => d.toISOString();
const dayKey = (d: Date | string) => new Date(d).toISOString().slice(0, 10);

type Fn = (...args: never[]) => unknown;
const asFn = (v: unknown): Fn | null => (typeof v === "function" ? (v as Fn) : null);

/**
 * HealthKit. Quantity identifiers are the stable Apple ones; we ask only for
 * what actually changes a fuelling plan — body mass, HRV, resting heart rate,
 * sleep and workouts. Nothing else is requested, so the permission sheet the
 * athlete sees is short and honest.
 */
const HK_READ = [
  "HKQuantityTypeIdentifierBodyMass",
  "HKQuantityTypeIdentifierHeartRateVariabilitySDNN",
  "HKQuantityTypeIdentifierRestingHeartRate",
  "HKCategoryTypeIdentifierSleepAnalysis",
  "HKWorkoutTypeIdentifier",
];

function appleHealthSource(): HealthSource | null {
  const hk = optionalRequire("@kingstinct/react-native-healthkit");
  if (!hk) return null;
  const isAvailable = asFn(hk.isHealthDataAvailable);
  const request = asFn(hk.requestAuthorization);
  const mostRecent = asFn(hk.getMostRecentQuantitySample);
  const samples = asFn(hk.queryQuantitySamples);
  const workouts = asFn(hk.queryWorkoutSamples);
  if (!request || !samples || !workouts) return null;

  return {
    platform: "apple-health",
    displayName: "Apple Health",
    async requestPermission() {
      if (isAvailable && (await isAvailable()) === false) return false;
      return (await request(HK_READ as never)) !== false;
    },
    async read(days) {
      const from = new Date(Date.now() - days * 86_400_000);
      const opts = { from, to: new Date() } as never;

      const mass = mostRecent ? ((await mostRecent("HKQuantityTypeIdentifierBodyMass" as never)) as
        | { quantity?: number }
        | undefined) : undefined;

      const quantity = async (id: string) =>
        ((await samples(id as never, opts)) as { startDate: string; quantity: number }[] | undefined) ?? [];
      const hrv = await quantity("HKQuantityTypeIdentifierHeartRateVariabilitySDNN");
      const rhr = await quantity("HKQuantityTypeIdentifierRestingHeartRate");

      // HealthKit reports HRV in seconds; the rest of the app works in ms.
      const daily = mergeDaily(
        hrv.map((s) => ({ date: dayKey(s.startDate), hrvMs: Math.round(s.quantity * 1000) })),
        rhr.map((s) => ({ date: dayKey(s.startDate), restingHr: Math.round(s.quantity) })),
      );

      const raw = ((await workouts(opts)) as
        | {
            uuid: string;
            workoutActivityType?: string | number;
            startDate: string;
            duration?: number;
            totalDistance?: { quantity?: number };
            totalEnergyBurned?: { quantity?: number };
          }[]
        | undefined) ?? [];

      return {
        bodyMassKg: typeof mass?.quantity === "number" ? mass.quantity : undefined,
        daily,
        workouts: raw.map((w) => ({
          externalId: w.uuid,
          sport: String(w.workoutActivityType ?? ""),
          startTime: iso(new Date(w.startDate)),
          durationSec: Math.round(w.duration ?? 0),
          distanceM: w.totalDistance?.quantity,
          calories: w.totalEnergyBurned?.quantity,
        })),
      };
    },
  };
}

/** Android Health Connect — same data, different SDK shape. */
function healthConnectSource(): HealthSource | null {
  const hc = optionalRequire("react-native-health-connect");
  if (!hc) return null;
  const initialize = asFn(hc.initialize);
  const requestPermission = asFn(hc.requestPermission);
  const readRecords = asFn(hc.readRecords);
  if (!requestPermission || !readRecords) return null;

  const PERMS = ["Weight", "HeartRateVariabilityRmssd", "RestingHeartRate", "SleepSession", "ExerciseSession"].map(
    (recordType) => ({ accessType: "read", recordType }),
  );

  return {
    platform: "google-health",
    displayName: "Health Connect",
    async requestPermission() {
      if (initialize) await initialize();
      const granted = (await requestPermission(PERMS as never)) as unknown[] | undefined;
      return Array.isArray(granted) && granted.length > 0;
    },
    async read(days) {
      const timeRangeFilter = {
        operator: "between",
        startTime: iso(new Date(Date.now() - days * 86_400_000)),
        endTime: iso(new Date()),
      };
      const records = async (recordType: string) =>
        (((await readRecords(recordType as never, { timeRangeFilter } as never)) as
          | { records?: Record<string, unknown>[] }
          | undefined)?.records ?? []);

      const weight = (await records("Weight")) as { weight?: { inKilograms?: number } }[];
      const hrv = (await records("HeartRateVariabilityRmssd")) as { time: string; heartRateVariabilityMillis?: number }[];
      const rhr = (await records("RestingHeartRate")) as { time: string; beatsPerMinute?: number }[];
      const sessions = (await records("ExerciseSession")) as {
        metadata?: { id?: string };
        exerciseType?: string | number;
        startTime: string;
        endTime: string;
      }[];

      const daily = mergeDaily(
        hrv
          .filter((r) => typeof r.heartRateVariabilityMillis === "number")
          .map((r) => ({ date: dayKey(r.time), hrvMs: Math.round(r.heartRateVariabilityMillis!) })),
        rhr
          .filter((r) => typeof r.beatsPerMinute === "number")
          .map((r) => ({ date: dayKey(r.time), restingHr: Math.round(r.beatsPerMinute!) })),
      );

      const latestWeight = weight.at(-1)?.weight?.inKilograms;
      return {
        bodyMassKg: typeof latestWeight === "number" ? latestWeight : undefined,
        daily,
        workouts: sessions
          .filter((s) => s.metadata?.id)
          .map((s) => ({
            externalId: s.metadata!.id!,
            sport: String(s.exerciseType ?? ""),
            startTime: iso(new Date(s.startTime)),
            durationSec: Math.round((Date.parse(s.endTime) - Date.parse(s.startTime)) / 1000),
          })),
      };
    },
  };
}

/** Collapse per-metric day lists into one entry per day. */
export function mergeDaily(
  ...lists: { date: string; hrvMs?: number; restingHr?: number; sleepScore?: number }[][]
): { date: string; hrvMs?: number; restingHr?: number; sleepScore?: number }[] {
  const byDate = new Map<string, { date: string; hrvMs?: number; restingHr?: number; sleepScore?: number }>();
  for (const list of lists) {
    for (const entry of list) {
      byDate.set(entry.date, { ...(byDate.get(entry.date) ?? { date: entry.date }), ...entry });
    }
  }
  return [...byDate.values()].sort((a, b) => b.date.localeCompare(a.date));
}

/** The health source for this device, or null where none can work. */
export function healthSource(): HealthSource | null {
  if (override) return override;
  if (Platform.OS === "ios") return appleHealthSource();
  if (Platform.OS === "android") return healthConnectSource();
  return null;
}

export interface HealthAvailability {
  available: boolean;
  displayName: string;
  /** Why it can't run here — shown to the athlete instead of a dead button. */
  reason?: string;
}

export function healthAvailability(): HealthAvailability {
  const source = healthSource();
  if (source) return { available: true, displayName: source.displayName };
  if (Platform.OS === "ios") {
    return {
      available: false,
      displayName: "Apple Health",
      reason: "Apple Health needs a development build of the app — it can't be read from Expo Go.",
    };
  }
  if (Platform.OS === "android") {
    return {
      available: false,
      displayName: "Health Connect",
      reason: "Health Connect needs a development build of the app — it can't be read from Expo Go.",
    };
  }
  return { available: false, displayName: "Health platform", reason: "Health data is only readable on a phone." };
}

/**
 * Read from the device and push to the server. Returns what the server did with
 * it, so the UI can report real counts rather than a hopeful "synced!".
 */
export async function syncHealth(days = 28): Promise<HealthSyncResult> {
  const source = healthSource();
  if (!source) throw new Error(healthAvailability().reason ?? "No health platform available on this device.");
  if (!(await source.requestPermission())) {
    throw new Error(`${source.displayName} access was declined. You can grant it later in your phone's settings.`);
  }
  const payload = await source.read(days);
  return api.healthSync({ platform: source.platform, ...payload });
}
