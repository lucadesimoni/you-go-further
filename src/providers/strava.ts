import type { Activity, SportType } from "../model";
import { DESCRIPTORS } from "./descriptors";
import { generateSampleActivities } from "./sampleData";
import { BaseActivityProvider, oauthConfig } from "./registry";
import type { FetchRange, ProviderCredential } from "./types";

/**
 * Real Strava connector: OAuth token exchange + activity fetch against the Strava
 * v3 API, with response normalization into our {@link Activity} model.
 *
 * When STRAVA_CLIENT_ID / STRAVA_CLIENT_SECRET are absent (dev), it falls back to
 * a mock token + sample activities so the whole connect flow runs locally. Set
 * the credentials to go live — no other code changes.
 */

const env = (k: string): string | undefined =>
  (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env?.[k];

/** Map a Strava activity `type`/`sport_type` to our sport vocabulary. */
export function mapStravaSport(type: string | undefined): SportType {
  switch (type) {
    case "Run":
      return "run";
    case "TrailRun":
      return "trail-run";
    case "Ride":
    case "VirtualRide":
    case "GravelRide":
    case "MountainBikeRide":
      return "ride";
    case "Swim":
      return "swim";
    case "Triathlon":
      return "triathlon";
    default:
      return "other";
  }
}

interface StravaActivity {
  id: number;
  name?: string;
  type?: string;
  sport_type?: string;
  start_date?: string;
  moving_time?: number;
  elapsed_time?: number;
  distance?: number;
  total_elevation_gain?: number;
  average_heartrate?: number;
  max_heartrate?: number;
  average_watts?: number;
  kilojoules?: number;
}

/** Normalize one Strava activity into our model. */
export function mapStravaActivity(s: StravaActivity): Activity {
  const externalId = String(s.id);
  return {
    id: `strava:${externalId}`,
    provider: "strava",
    externalId,
    sport: mapStravaSport(s.sport_type ?? s.type),
    startTime: s.start_date ?? new Date().toISOString(),
    durationSec: s.moving_time ?? s.elapsed_time ?? 0,
    distanceM: s.distance,
    elevationGainM: s.total_elevation_gain,
    avgHr: s.average_heartrate,
    maxHr: s.max_heartrate,
    avgPowerW: s.average_watts,
    calories: s.kilojoules != null ? Math.round(s.kilojoules) : undefined,
    name: s.name,
  };
}

export class StravaProvider extends BaseActivityProvider {
  constructor(private readonly fetchImpl: typeof fetch = fetch) {
    super(DESCRIPTORS.strava);
  }

  private configured(): boolean {
    return Boolean(env("STRAVA_CLIENT_ID") && env("STRAVA_CLIENT_SECRET"));
  }

  /** Exchange an authorization code for tokens (Strava OAuth token endpoint). */
  async exchangeToken(code: string, _redirectUri: string): Promise<ProviderCredential> {
    if (!this.configured() || code.startsWith("dev-")) {
      // Dev: no registered app — mint a mock credential so the flow completes.
      return {
        provider: "strava",
        accessToken: "dev-strava-token",
        refreshToken: "dev-strava-refresh",
        expiresAt: Date.now() + 6 * 3600_000,
        athleteId: "dev-athlete",
      };
    }
    const body = new URLSearchParams({
      client_id: env("STRAVA_CLIENT_ID")!,
      client_secret: env("STRAVA_CLIENT_SECRET")!,
      code,
      grant_type: "authorization_code",
    });
    const res = await this.fetchImpl(oauthConfig(this.descriptor).tokenUrl, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body,
    });
    if (!res.ok) throw new Error(`Strava token exchange failed: HTTP ${res.status}`);
    const j = (await res.json()) as {
      access_token: string;
      refresh_token?: string;
      expires_at?: number;
      athlete?: { id?: number };
    };
    return {
      provider: "strava",
      accessToken: j.access_token,
      refreshToken: j.refresh_token,
      expiresAt: (j.expires_at ?? 0) * 1000,
      athleteId: j.athlete?.id != null ? String(j.athlete.id) : undefined,
    };
  }

  /**
   * Trade the refresh token for a fresh access token.
   *
   * A Strava access token lasts six hours. Without this, the first sync of the
   * day works and every one after it returns 401 — the athlete sees their
   * history stop and no error explaining why.
   */
  async refreshToken(credential: ProviderCredential): Promise<ProviderCredential> {
    if (!this.configured() || !credential.refreshToken || credential.refreshToken.startsWith("dev-")) {
      return credential;
    }
    const body = new URLSearchParams({
      client_id: env("STRAVA_CLIENT_ID")!,
      client_secret: env("STRAVA_CLIENT_SECRET")!,
      grant_type: "refresh_token",
      refresh_token: credential.refreshToken,
    });
    const res = await this.fetchImpl(oauthConfig(this.descriptor).tokenUrl, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body,
    });
    if (!res.ok) throw new Error(`Strava token refresh failed: HTTP ${res.status}`);
    const j = (await res.json()) as { access_token: string; refresh_token?: string; expires_at?: number };
    return {
      ...credential,
      accessToken: j.access_token,
      // Strava rotates the refresh token; keeping the old one would work until
      // it silently stopped.
      refreshToken: j.refresh_token ?? credential.refreshToken,
      expiresAt: (j.expires_at ?? 0) * 1000,
    };
  }

  /** Refresh first when the token is expired, or about to be mid-request. */
  private async fresh(credential: ProviderCredential): Promise<ProviderCredential> {
    const expiresAt = credential.expiresAt ?? 0;
    if (expiresAt === 0 || expiresAt - Date.now() > 60_000) return credential;
    return this.refreshToken(credential);
  }

  async fetchActivities(credential: ProviderCredential, range: FetchRange): Promise<Activity[]> {
    if (!this.configured() || credential.accessToken.startsWith("dev-")) {
      return generateSampleActivities("strava", range.after, range.before);
    }
    const live = await this.fresh(credential);
    const after = Math.floor(Date.parse(range.after) / 1000);
    const before = Math.floor(Date.parse(range.before) / 1000);

    // Strava paginates. A single page silently truncates any athlete with more
    // than `PER_PAGE` sessions in the window — which a season backfill always
    // has, and which looks exactly like "they did not train much".
    const PER_PAGE = 100;
    const MAX_PAGES = 20; // 2000 sessions; past that, narrow the window instead.
    const out: Activity[] = [];
    for (let page = 1; page <= MAX_PAGES; page++) {
      const url = `https://www.strava.com/api/v3/athlete/activities?after=${after}&before=${before}&per_page=${PER_PAGE}&page=${page}`;
      const res = await this.fetchImpl(url, { headers: { Authorization: `Bearer ${live.accessToken}` } });
      // 429 is Strava's rate limit, and retrying immediately makes it worse.
      // Returning what we have keeps the sync partial rather than empty.
      if (res.status === 429) break;
      if (!res.ok) throw new Error(`Strava activities fetch failed: HTTP ${res.status}`);
      const arr = (await res.json()) as StravaActivity[];
      out.push(...arr.map(mapStravaActivity));
      // A short page is the last page.
      if (arr.length < PER_PAGE) break;
    }
    return out;
  }
}
