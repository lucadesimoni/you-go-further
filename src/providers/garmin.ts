import type { Activity, SportType } from "../model";
import { DESCRIPTORS } from "./descriptors";
import { generateSampleActivities } from "./sampleData";
import { BaseActivityProvider } from "./registry";
import type { FetchRange, ProviderCredential } from "./types";

/**
 * Garmin connector. Follows the same shape as {@link StravaProvider}: token
 * exchange + activity fetch mapped into our model, with a dev fallback (mock
 * token + sample data) so it runs without credentials.
 *
 * NOTE: Garmin's production Health/Activity API uses OAuth 1.0a plus push
 * (ping/pull) notifications rather than a simple OAuth2 pull. This adapter keeps
 * the normalized fetch+map shape; the real transport is wired behind
 * GARMIN_CONSUMER_KEY / GARMIN_CONSUMER_SECRET. See docs/auth.md.
 */

const env = (k: string): string | undefined =>
  (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env?.[k];

/** Map a Garmin activityType key to our sport vocabulary. */
export function mapGarminSport(type: string | undefined): SportType {
  const t = (type ?? "").toLowerCase();
  if (t.includes("trail")) return "trail-run";
  if (t.includes("run")) return "run";
  if (t.includes("cycl") || t.includes("bik")) return "ride";
  if (t.includes("swim")) return "swim";
  if (t.includes("multi") || t.includes("triathlon")) return "triathlon";
  return "other";
}

interface GarminActivity {
  activityId: number | string;
  activityName?: string;
  activityType?: { typeKey?: string };
  startTimeGMT?: string;
  durationInSeconds?: number;
  distanceInMeters?: number;
  elevationGainInMeters?: number;
  averageHeartRateInBeatsPerMinute?: number;
  maxHeartRateInBeatsPerMinute?: number;
  averagePowerInWatts?: number;
  activeKilocalories?: number;
}

/** Normalize one Garmin activity into our model. */
export function mapGarminActivity(g: GarminActivity): Activity {
  const externalId = String(g.activityId);
  return {
    id: `garmin:${externalId}`,
    provider: "garmin",
    externalId,
    sport: mapGarminSport(g.activityType?.typeKey),
    startTime: g.startTimeGMT ? new Date(g.startTimeGMT).toISOString() : new Date().toISOString(),
    durationSec: g.durationInSeconds ?? 0,
    distanceM: g.distanceInMeters,
    elevationGainM: g.elevationGainInMeters,
    avgHr: g.averageHeartRateInBeatsPerMinute,
    maxHr: g.maxHeartRateInBeatsPerMinute,
    avgPowerW: g.averagePowerInWatts,
    calories: g.activeKilocalories,
    trainingLoad: undefined,
    name: g.activityName,
  };
}

export class GarminProvider extends BaseActivityProvider {
  constructor(private readonly fetchImpl: typeof fetch = fetch) {
    super(DESCRIPTORS.garmin);
  }

  private configured(): boolean {
    return Boolean(env("GARMIN_CONSUMER_KEY") && env("GARMIN_CONSUMER_SECRET"));
  }

  async exchangeToken(code: string, _redirectUri: string): Promise<ProviderCredential> {
    if (!this.configured() || code.startsWith("dev-")) {
      return {
        provider: "garmin",
        accessToken: "dev-garmin-token",
        refreshToken: "dev-garmin-refresh",
        expiresAt: Date.now() + 6 * 3600_000,
        athleteId: "dev-garmin-athlete",
      };
    }
    const body = new URLSearchParams({
      client_id: env("GARMIN_CONSUMER_KEY")!,
      client_secret: env("GARMIN_CONSUMER_SECRET")!,
      code,
      grant_type: "authorization_code",
    });
    const res = await this.fetchImpl(this.descriptor.oauth.tokenUrl, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body,
    });
    if (!res.ok) throw new Error(`Garmin token exchange failed: HTTP ${res.status}`);
    const j = (await res.json()) as { access_token: string; refresh_token?: string; expires_in?: number };
    return {
      provider: "garmin",
      accessToken: j.access_token,
      refreshToken: j.refresh_token,
      expiresAt: Date.now() + (j.expires_in ?? 0) * 1000,
    };
  }

  async fetchActivities(credential: ProviderCredential, range: FetchRange): Promise<Activity[]> {
    if (!this.configured() || credential.accessToken.startsWith("dev-")) {
      return generateSampleActivities("garmin", range.after, range.before);
    }
    const start = Math.floor(Date.parse(range.after) / 1000);
    const end = Math.floor(Date.parse(range.before) / 1000);
    const url = `https://apis.garmin.com/wellness-api/rest/activities?uploadStartTimeInSeconds=${start}&uploadEndTimeInSeconds=${end}`;
    const res = await this.fetchImpl(url, { headers: { Authorization: `Bearer ${credential.accessToken}` } });
    if (!res.ok) throw new Error(`Garmin activities fetch failed: HTTP ${res.status}`);
    const arr = (await res.json()) as GarminActivity[];
    return arr.map(mapGarminActivity);
  }
}
