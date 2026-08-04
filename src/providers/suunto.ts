import type { Activity, SportType } from "../model";
import { DESCRIPTORS } from "./descriptors";
import { generateSampleActivities } from "./sampleData";
import { BaseActivityProvider, oauthConfig } from "./registry";
import type { FetchRange, ProviderCredential } from "./types";

/**
 * Suunto (Cloud API) connector — OAuth2 token exchange + workout fetch mapped
 * into our model, with a dev fallback. Suunto's real API keys workouts by a
 * numeric activity id and needs an `Ocp-Apim-Subscription-Key`; validate the
 * mapping against live responses (see docs/auth.md).
 */

const env = (k: string): string | undefined =>
  (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env?.[k];

export function mapSuuntoSport(activityType: string | undefined): SportType {
  const t = (activityType ?? "").toLowerCase();
  if (t.includes("trail")) return "trail-run";
  if (t.includes("run")) return "run";
  if (t.includes("cycl") || t.includes("bik")) return "ride";
  if (t.includes("swim")) return "swim";
  if (t.includes("triathlon") || t.includes("multisport")) return "triathlon";
  return "other";
}

/**
 * Suunto's numeric activity enum.
 *
 * Only the ids this platform actually plans for are named; everything else is
 * honestly "other" rather than guessed at. Written from the published enum and
 * **not verified against the live API from here** — `scripts/verify-providers.mjs`
 * is what checks it where the network and a token exist.
 */
const SUUNTO_ACTIVITY_IDS: Record<number, string> = {
  1: "running",
  2: "cycling",
  3: "cycling",
  5: "swimming",
  11: "trail running",
  13: "trailrunning",
  21: "triathlon",
  59: "trail running",
};

interface SuuntoWorkout {
  workoutId?: number | string;
  workoutKey?: string;
  /** Some payloads name the sport; others send only the numeric enum. */
  activityType?: string;
  activityId?: number;
  startTime?: number; // epoch ms
  totalTime?: number; // seconds
  totalDistance?: number; // meters
  totalAscent?: number;
  /**
   * Heart rate — in **hertz** on most firmware, already bpm on some.
   * @see toBpm
   */
  hravg?: number;
  hrmax?: number;
  energyConsumption?: number; // kcal
}

/**
 * Suunto reports heart rate in beats per **second**, and not consistently: some
 * firmware sends bpm in the same field.
 *
 * This is the worst kind of unit bug, because it does not throw. An average of
 * 2.6 is a perfectly valid number that quietly makes every intensity inference,
 * every training load and every fuelling target wrong.
 *
 * Nothing plausible sits between the two scales: a human at rest is above 25 bpm
 * and no one sustains 15 beats per second, so a value under 15 is hertz.
 */
export function toBpm(value: number | undefined): number | undefined {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) return undefined;
  return value < 15 ? Math.round(value * 60) : Math.round(value);
}

export function mapSuuntoActivity(w: SuuntoWorkout): Activity {
  const externalId = String(w.workoutId ?? w.workoutKey ?? "");
  const typeName = w.activityType ?? (typeof w.activityId === "number" ? SUUNTO_ACTIVITY_IDS[w.activityId] : undefined);
  return {
    id: `suunto:${externalId}`,
    provider: "suunto",
    externalId,
    sport: mapSuuntoSport(typeName),
    startTime: w.startTime ? new Date(w.startTime).toISOString() : new Date().toISOString(),
    durationSec: Math.round(w.totalTime ?? 0),
    distanceM: w.totalDistance,
    elevationGainM: w.totalAscent,
    avgHr: toBpm(w.hravg),
    maxHr: toBpm(w.hrmax),
    calories: w.energyConsumption != null ? Math.round(w.energyConsumption) : undefined,
    name: w.activityType,
  };
}

export class SuuntoProvider extends BaseActivityProvider {
  constructor(private readonly fetchImpl: typeof fetch = fetch) {
    super(DESCRIPTORS.suunto);
  }

  private configured(): boolean {
    return Boolean(env("SUUNTO_CLIENT_ID") && env("SUUNTO_CLIENT_SECRET"));
  }

  async exchangeToken(code: string, redirectUri: string): Promise<ProviderCredential> {
    if (!this.configured() || code.startsWith("dev-")) {
      return { provider: "suunto", accessToken: "dev-suunto-token", expiresAt: Date.now() + 6 * 3600_000, athleteId: "dev-suunto" };
    }
    const body = new URLSearchParams({
      grant_type: "authorization_code",
      code,
      client_id: env("SUUNTO_CLIENT_ID")!,
      client_secret: env("SUUNTO_CLIENT_SECRET")!,
      redirect_uri: redirectUri,
    });
    const res = await this.fetchImpl(oauthConfig(this.descriptor).tokenUrl, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body,
    });
    if (!res.ok) throw new Error(`Suunto token exchange failed: HTTP ${res.status}`);
    const j = (await res.json()) as { access_token: string; expires_in?: number; user?: string };
    return {
      provider: "suunto",
      accessToken: j.access_token,
      expiresAt: Date.now() + (j.expires_in ?? 0) * 1000,
      athleteId: j.user,
    };
  }

  async fetchActivities(credential: ProviderCredential, range: FetchRange): Promise<Activity[]> {
    if (!this.configured() || credential.accessToken.startsWith("dev-")) {
      return generateSampleActivities("suunto", range.after, range.before);
    }
    const since = Date.parse(range.after);
    const until = Date.parse(range.before);
    const res = await this.fetchImpl(`https://cloudapi.suunto.com/v2/workouts?since=${since}&until=${until}`, {
      headers: {
        Authorization: `Bearer ${credential.accessToken}`,
        "Ocp-Apim-Subscription-Key": env("SUUNTO_SUBSCRIPTION_KEY") ?? "",
      },
    });
    if (!res.ok) throw new Error(`Suunto workouts fetch failed: HTTP ${res.status}`);
    const json = (await res.json()) as { payload?: SuuntoWorkout[] } | SuuntoWorkout[];
    const arr = Array.isArray(json) ? json : (json.payload ?? []);
    return arr.map(mapSuuntoActivity);
  }
}
