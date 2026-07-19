import type { Activity, SportType } from "../model";
import { DESCRIPTORS } from "./descriptors";
import { generateSampleActivities } from "./sampleData";
import { BaseActivityProvider } from "./registry";
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
  "start-time"?: string;
  duration?: string;
  distance?: number;
  calories?: number;
  "heart-rate"?: { average?: number; maximum?: number };
}

export function mapPolarActivity(e: PolarExercise): Activity {
  const externalId = String(e.id);
  return {
    id: `polar:${externalId}`,
    provider: "polar",
    externalId,
    sport: mapPolarSport(e.sport ?? e["detailed-sport-info"]),
    startTime: e["start-time"] ? new Date(e["start-time"]).toISOString() : new Date().toISOString(),
    durationSec: parseIsoDuration(e.duration),
    distanceM: typeof e.distance === "number" ? e.distance : undefined,
    avgHr: e["heart-rate"]?.average,
    maxHr: e["heart-rate"]?.maximum,
    calories: e.calories,
    name: e.sport,
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
    const res = await this.fetchImpl(this.descriptor.oauth.tokenUrl, {
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
