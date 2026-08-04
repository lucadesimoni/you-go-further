import type { Activity, SportType } from "../model";
import { DESCRIPTORS } from "./descriptors";
import { generateSampleActivities } from "./sampleData";
import { BaseActivityProvider, oauthConfig } from "./registry";
import type { FetchRange, ProviderCredential } from "./types";

/**
 * Polar (AccessLink) connector — OAuth2 token exchange + exercise fetch mapped
 * into our model, with a dev fallback. Field mappings should be validated
 * against live AccessLink responses; see docs/auth.md.
 */

const env = (k: string): string | undefined =>
  (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env?.[k];

/** Parse an ISO-8601 duration (e.g. "PT1H2M3S") into seconds. */
export function parseIsoDuration(iso: string | undefined): number {
  if (!iso) return 0;
  const m = /P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?(?:(\d+(?:\.\d+)?)S)?/.exec(iso);
  if (!m) return 0;
  const [, d, h, mi, s] = m;
  return Number(d || 0) * 86400 + Number(h || 0) * 3600 + Number(mi || 0) * 60 + Math.round(Number(s || 0));
}

export function mapPolarSport(sport: string | undefined): SportType {
  const s = (sport ?? "").toUpperCase();
  if (s.includes("TRAIL")) return "trail-run";
  if (s.includes("RUN")) return "run";
  if (s.includes("CYCL") || s.includes("BIK")) return "ride";
  if (s.includes("SWIM")) return "swim";
  if (s.includes("TRIATHLON")) return "triathlon";
  return "other";
}

interface PolarExercise {
  id: number | string;
  sport?: string;
  "detailed-sport-info"?: string;
  /** Local wall-clock time, with no zone designator of its own. */
  "start-time"?: string;
  /** Minutes east of UTC for that wall-clock time. */
  "start-time-utc-offset"?: number;
  duration?: string;
  distance?: number;
  calories?: number;
  "heart-rate"?: { average?: number; maximum?: number };
  /** Polar's own computed load for the session. */
  "training-load"?: number;
  device?: string;
}

/**
 * Polar's `start-time` is **local wall-clock with no zone**, and the zone comes
 * separately in `start-time-utc-offset` (minutes). Parsing the string alone
 * makes the runtime guess: Node reads it as the *server's* local time, so the
 * same session lands at a different instant depending on where it was imported.
 * A Swiss athlete's summer sessions come out two hours off.
 */
function polarStartTime(e: PolarExercise): string | undefined {
  const raw = e["start-time"];
  if (!raw) return undefined;
  const offsetMin = e["start-time-utc-offset"];
  // Already carries a zone: trust it.
  if (/[Zz]|[+-]\d\d:?\d\d$/.test(raw)) {
    const t = Date.parse(raw);
    return Number.isNaN(t) ? undefined : new Date(t).toISOString();
  }
  const asUtc = Date.parse(`${raw}Z`);
  if (Number.isNaN(asUtc)) return undefined;
  // The wall clock read as UTC, minus the offset, is the true instant.
  return new Date(asUtc - (typeof offsetMin === "number" ? offsetMin : 0) * 60_000).toISOString();
}

export function mapPolarActivity(e: PolarExercise): Activity {
  const externalId = String(e.id);
  // The coarse `sport` is often just "OTHER"; the detailed field is where a
  // trail run or a road ride is actually distinguishable.
  const detailed = e["detailed-sport-info"];
  const coarse = e.sport;
  const bySport = mapPolarSport(coarse);
  return {
    id: `polar:${externalId}`,
    provider: "polar",
    externalId,
    sport: bySport === "other" ? mapPolarSport(detailed) : bySport,
    startTime: polarStartTime(e) ?? new Date().toISOString(),
    durationSec: parseIsoDuration(e.duration),
    distanceM: typeof e.distance === "number" ? e.distance : undefined,
    avgHr: e["heart-rate"]?.average,
    maxHr: e["heart-rate"]?.maximum,
    calories: e.calories,
    // Polar computes this on the device from the athlete's own HR reserve.
    // Discarding it and recomputing from averages is strictly worse.
    trainingLoad: typeof e["training-load"] === "number" ? e["training-load"] : undefined,
    name: detailed ?? coarse,
  };
}

export class PolarProvider extends BaseActivityProvider {
  constructor(private readonly fetchImpl: typeof fetch = fetch) {
    super(DESCRIPTORS.polar);
  }

  private configured(): boolean {
    return Boolean(env("POLAR_CLIENT_ID") && env("POLAR_CLIENT_SECRET"));
  }

  async exchangeToken(code: string, _redirectUri: string): Promise<ProviderCredential> {
    if (!this.configured() || code.startsWith("dev-")) {
      return { provider: "polar", accessToken: "dev-polar-token", expiresAt: Date.now() + 6 * 3600_000, athleteId: "dev-polar" };
    }
    const body = new URLSearchParams({
      grant_type: "authorization_code",
      code,
      client_id: env("POLAR_CLIENT_ID")!,
      client_secret: env("POLAR_CLIENT_SECRET")!,
    });
    const res = await this.fetchImpl(oauthConfig(this.descriptor).tokenUrl, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded", Accept: "application/json" },
      body,
    });
    if (!res.ok) throw new Error(`Polar token exchange failed: HTTP ${res.status}`);
    const j = (await res.json()) as { access_token: string; expires_in?: number; x_user_id?: number };
    return {
      provider: "polar",
      accessToken: j.access_token,
      expiresAt: Date.now() + (j.expires_in ?? 0) * 1000,
      athleteId: j.x_user_id != null ? String(j.x_user_id) : undefined,
    };
  }

  async fetchActivities(credential: ProviderCredential, range: FetchRange): Promise<Activity[]> {
    if (!this.configured() || credential.accessToken.startsWith("dev-")) {
      return generateSampleActivities("polar", range.after, range.before);
    }
    const res = await this.fetchImpl("https://www.polaraccesslink.com/v3/exercises", {
      headers: { Authorization: `Bearer ${credential.accessToken}`, Accept: "application/json" },
    });
    if (!res.ok) throw new Error(`Polar exercises fetch failed: HTTP ${res.status}`);
    const arr = (await res.json()) as PolarExercise[];
    return arr.map(mapPolarActivity);
  }
}
