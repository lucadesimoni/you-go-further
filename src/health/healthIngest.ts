import type { Activity, ProviderId, SportType, Wellness } from "../model";

/**
 * Ingest for the on-device health platforms.
 *
 * Apple HealthKit and Android Health Connect have **no server-to-server API** —
 * by design, the samples never leave the phone except through an app the athlete
 * has granted read access to. So the phone reads them and posts them here, and
 * everything after that (validation, readiness, profile updates) happens on the
 * server, exactly like the OAuth connectors. One implementation, one set of
 * numbers, whichever device the athlete opens.
 *
 * Nothing here trusts the client: every field is range-checked, unknown sports
 * fall back to `other`, and a malformed workout is dropped rather than poisoning
 * the athlete's history.
 */

export type HealthPlatformId = Extract<ProviderId, "apple-health" | "google-health">;

const PLATFORMS: HealthPlatformId[] = ["apple-health", "google-health"];

export const isHealthPlatform = (v: unknown): v is HealthPlatformId =>
  typeof v === "string" && (PLATFORMS as string[]).includes(v);

/** A workout as the phone reads it from HealthKit / Health Connect. */
export interface HealthWorkout {
  /** The platform's own uuid — used to de-duplicate across syncs. */
  externalId: string;
  /** Platform sport name, e.g. HKWorkoutActivityTypeRunning or "RUNNING". */
  sport: string;
  startTime: string;
  durationSec: number;
  distanceM?: number;
  elevationGainM?: number;
  avgHr?: number;
  maxHr?: number;
  calories?: number;
}

/** A day of body signals: HRV, resting HR, sleep. */
export interface HealthDaily {
  /** ISO date (YYYY-MM-DD). */
  date: string;
  restingHr?: number;
  hrvMs?: number;
  sleepScore?: number;
  /** Only some platforms report a readiness score; we derive one when they don't. */
  readiness?: number;
}

export interface HealthSyncPayload {
  platform: HealthPlatformId;
  bodyMassKg?: number;
  daily?: HealthDaily[];
  workouts?: HealthWorkout[];
}

export interface NormalizedHealthSync {
  platform: HealthPlatformId;
  bodyMassKg?: number;
  wellness: Wellness[];
  activities: Activity[];
  /** Inputs we refused, so the client can be told plainly rather than silently. */
  rejected: { workouts: number; days: number };
}

/**
 * Platform workout type → our sport. HealthKit uses `HKWorkoutActivityType*`,
 * Health Connect uses SCREAMING_SNAKE names; both are matched loosely so a new
 * platform spelling degrades to `other` instead of breaking the sync.
 */
export function mapHealthSport(raw: string): SportType {
  const s = raw.toLowerCase().replace(/^hkworkoutactivitytype/, "").replace(/[_\s-]/g, "");
  if (s.includes("triathlon")) return "triathlon";
  if (s.includes("swim")) return "swim";
  if (s.includes("cycling") || s.includes("bike") || s.includes("biking") || s.includes("ride")) return "ride";
  // Trail has to win over plain running — "trailrunning" contains both.
  if (s.includes("trail")) return "trail-run";
  if (s.includes("running") || s === "run") return "run";
  return "other";
}

const num = (v: unknown): number | undefined => (typeof v === "number" && Number.isFinite(v) ? v : undefined);
const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));
const inRange = (v: number | undefined, lo: number, hi: number): number | undefined =>
  v === undefined ? undefined : v >= lo && v <= hi ? Math.round(v) : undefined;

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Validate and convert a phone payload into our own domain shapes. */
export function normalizeHealthSync(payload: unknown, now = new Date()): NormalizedHealthSync | null {
  if (!payload || typeof payload !== "object") return null;
  const p = payload as Partial<HealthSyncPayload>;
  if (!isHealthPlatform(p.platform)) return null;
  const platform = p.platform;

  const horizon = now.getTime() + 86_400_000; // tolerate a little clock skew
  const floor = now.getTime() - 400 * 86_400_000; // a year and a bit of history

  let rejectedWorkouts = 0;
  const activities: Activity[] = [];
  for (const w of Array.isArray(p.workouts) ? p.workouts : []) {
    const externalId = typeof w?.externalId === "string" ? w.externalId.slice(0, 200) : "";
    const started = typeof w?.startTime === "string" ? Date.parse(w.startTime) : NaN;
    const durationSec = num(w?.durationSec);
    // A session needs an identity, a real time and a plausible length (1 min–24 h).
    if (!externalId || Number.isNaN(started) || started > horizon || started < floor) {
      rejectedWorkouts++;
      continue;
    }
    if (durationSec === undefined || durationSec < 60 || durationSec > 86_400) {
      rejectedWorkouts++;
      continue;
    }
    activities.push({
      id: `${platform}:${externalId}`,
      provider: platform,
      externalId,
      sport: mapHealthSport(typeof w.sport === "string" ? w.sport : ""),
      startTime: new Date(started).toISOString(),
      durationSec: Math.round(durationSec),
      distanceM: inRange(num(w.distanceM), 0, 1_000_000),
      elevationGainM: inRange(num(w.elevationGainM), 0, 30_000),
      avgHr: inRange(num(w.avgHr), 25, 240),
      maxHr: inRange(num(w.maxHr), 25, 240),
      calories: inRange(num(w.calories), 0, 30_000),
    });
  }

  let rejectedDays = 0;
  const wellness: Wellness[] = [];
  for (const d of Array.isArray(p.daily) ? p.daily : []) {
    if (typeof d?.date !== "string" || !ISO_DATE.test(d.date) || Number.isNaN(Date.parse(d.date))) {
      rejectedDays++;
      continue;
    }
    const restingHr = inRange(num(d.restingHr), 25, 120);
    const hrvMs = inRange(num(d.hrvMs), 5, 300);
    const sleepScore = inRange(num(d.sleepScore), 0, 100);
    const readiness = inRange(num(d.readiness), 0, 100);
    if (restingHr === undefined && hrvMs === undefined && sleepScore === undefined && readiness === undefined) {
      rejectedDays++;
      continue;
    }
    wellness.push({ provider: platform, date: d.date, restingHr, hrvMs, sleepScore, readiness });
  }

  const rawMass = num(p.bodyMassKg);
  const bodyMassKg = rawMass !== undefined && rawMass >= 30 && rawMass <= 200 ? Math.round(rawMass) : undefined;

  return { platform, bodyMassKg, wellness, activities, rejected: { workouts: rejectedWorkouts, days: rejectedDays } };
}

/**
 * Readiness from raw signals, for the platforms that don't score it themselves.
 *
 * HealthKit and Health Connect hand over HRV and resting heart rate but no
 * readiness number, so we compute one the way the literature reads it: HRV
 * relative to the athlete's own recent baseline is the dominant term, resting HR
 * above baseline is a smaller penalty, and sleep nudges it. It is deliberately
 * conservative — a single bad night moves it a few points, not thirty.
 *
 * Returns undefined when there is nothing to go on; we never invent a number.
 */
export function readinessFromSignals(wellness: Wellness[], now = new Date()): number | undefined {
  if (!wellness.length) return undefined;
  const sorted = [...wellness].sort((a, b) => b.date.localeCompare(a.date));
  // If the platform already scores readiness, that is better than our estimate.
  const reported = sorted.find((w) => typeof w.readiness === "number")?.readiness;
  if (typeof reported === "number") return clamp(Math.round(reported), 0, 100);

  const windowMs = 28 * 86_400_000;
  const recent = sorted.filter((w) => now.getTime() - Date.parse(w.date) <= windowMs);
  const nums = (xs: (number | undefined)[]) => xs.filter((v): v is number => typeof v === "number");
  const avg = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;

  const hrvs = nums(recent.map((w) => w.hrvMs));
  const rhrs = nums(recent.map((w) => w.restingHr));
  const latestHrv = sorted.find((w) => typeof w.hrvMs === "number")?.hrvMs;
  const latestRhr = sorted.find((w) => typeof w.restingHr === "number")?.restingHr;
  const latestSleep = sorted.find((w) => typeof w.sleepScore === "number")?.sleepScore;

  // Need a baseline of at least a few days before a deviation means anything.
  const hrvBase = hrvs.length >= 3 ? avg(hrvs) : undefined;
  const rhrBase = rhrs.length >= 3 ? avg(rhrs) : undefined;
  if (hrvBase === undefined && rhrBase === undefined && latestSleep === undefined) return undefined;

  let score = 65; // a neutral, unremarkable day
  if (hrvBase !== undefined && latestHrv !== undefined) {
    // ±25 % from baseline maps to roughly ±25 points, then flattens.
    const ratio = (latestHrv - hrvBase) / hrvBase;
    score += clamp(ratio * 100, -25, 25);
  }
  if (rhrBase !== undefined && latestRhr !== undefined) {
    // Resting HR above baseline is the classic "not recovered" signal.
    score += clamp((rhrBase - latestRhr) * 2, -12, 8);
  }
  if (latestSleep !== undefined) {
    score += clamp((latestSleep - 75) / 5, -6, 6);
  }
  return clamp(Math.round(score), 0, 100);
}

/**
 * Sweat sodium is genuinely not measurable from a phone. Neither platform
 * exposes it, so we leave the athlete's own value alone rather than overwriting
 * it with something we made up.
 */
export interface HealthProfileUpdate {
  bodyWeightKg?: number;
  readiness?: number;
  useSignals?: boolean;
  syncedFrom?: string;
}

/** What a sync should change about the athlete's profile — and nothing more. */
export function profileUpdateFromSync(
  sync: NormalizedHealthSync,
  displayName: string,
  now = new Date(),
): HealthProfileUpdate {
  const update: HealthProfileUpdate = { syncedFrom: displayName };
  if (sync.bodyMassKg !== undefined) update.bodyWeightKg = sync.bodyMassKg;
  const readiness = readinessFromSignals(sync.wellness, now);
  if (readiness !== undefined) update.readiness = readiness;
  return update;
}
