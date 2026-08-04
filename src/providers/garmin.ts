import type { Activity, SportType } from "../model";
import { DESCRIPTORS } from "./descriptors";
import { generateSampleActivities } from "./sampleData";
import { BaseActivityProvider, oauthConfig } from "./registry";
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

/**
 * Garmin ships **two** activity shapes, and both turn up in the wild.
 *
 * The official Health/Activity API sends `activityType` as a string enum
 * (`"TRAIL_RUNNING"`) and the start as `startTimeInSeconds` + a local
 * `startTimeOffsetInSeconds`. The internal Garmin Connect web endpoints — what
 * most third-party examples on the internet are actually written against — send
 * `activityType: { typeKey }` and `startTimeGMT` instead.
 *
 * Reading only one of them is not a partial failure but a silent one: every
 * session comes back with sport "other" and a start time of *now*, which is
 * exactly the data training-load analysis is built on.
 */
interface GarminActivity {
  activityId?: number | string;
  /** Health API: the id the push notifications de-duplicate on. */
  summaryId?: number | string;
  activityName?: string;
  /** Health API sends a string; the web API sends an object. */
  activityType?: string | { typeKey?: string; typeId?: number };
  /** Health API: epoch seconds, already UTC. */
  startTimeInSeconds?: number;
  /** Health API: the athlete's local offset. Informational — the epoch is UTC. */
  startTimeOffsetInSeconds?: number;
  /** Web API: a "YYYY-MM-DD HH:mm:ss" string, in GMT despite the space. */
  startTimeGMT?: string;
  durationInSeconds?: number;
  distanceInMeters?: number;
  /** Health API name. */
  totalElevationGainInMeters?: number;
  /** Web API name. */
  elevationGainInMeters?: number;
  averageHeartRateInBeatsPerMinute?: number;
  maxHeartRateInBeatsPerMinute?: number;
  averagePowerInWatts?: number;
  activeKilocalories?: number;
}

/** The activity type, from whichever of the two shapes this payload uses. */
function garminTypeKey(t: GarminActivity["activityType"]): string | undefined {
  return typeof t === "string" ? t : t?.typeKey;
}

/**
 * Start time, from whichever shape this payload uses.
 *
 * `startTimeInSeconds` is already UTC, so `startTimeOffsetInSeconds` must *not*
 * be added — doing so shifts every session by the athlete's timezone and puts
 * some of them on the wrong day. `startTimeGMT` carries a space instead of a T,
 * which `Date` parses as local time in Node, so it is normalised first.
 */
function garminStartTime(g: GarminActivity): string | undefined {
  if (typeof g.startTimeInSeconds === "number") return new Date(g.startTimeInSeconds * 1000).toISOString();
  if (!g.startTimeGMT) return undefined;
  const iso = g.startTimeGMT.includes("T") ? g.startTimeGMT : g.startTimeGMT.replace(" ", "T");
  const withZone = /[Zz]|[+-]\d\d:?\d\d$/.test(iso) ? iso : `${iso}Z`;
  const parsed = Date.parse(withZone);
  return Number.isNaN(parsed) ? undefined : new Date(parsed).toISOString();
}

/** Normalize one Garmin activity into our model. */
export function mapGarminActivity(g: GarminActivity): Activity {
  // The Health API de-duplicates on `summaryId`; the web API only has
  // `activityId`. Preferring the summary id keeps repeated pushes idempotent.
  const externalId = String(g.summaryId ?? g.activityId ?? "");
  const startTime = garminStartTime(g);
  return {
    id: `garmin:${externalId}`,
    provider: "garmin",
    externalId,
    sport: mapGarminSport(garminTypeKey(g.activityType)),
    // Falling back to "now" would stamp imported history with today's date, so
    // it is the last resort and never silently preferred.
    startTime: startTime ?? new Date().toISOString(),
    durationSec: g.durationInSeconds ?? 0,
    distanceM: g.distanceInMeters,
    elevationGainM: g.totalElevationGainInMeters ?? g.elevationGainInMeters,
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
    const res = await this.fetchImpl(oauthConfig(this.descriptor).tokenUrl, {
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
