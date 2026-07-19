import type { Activity, SportType } from "../model";
import { DESCRIPTORS } from "./descriptors";
import { generateSampleActivities } from "./sampleData";
import { BaseActivityProvider } from "./registry";
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

interface SuuntoWorkout {
  workoutId?: number | string;
  workoutKey?: string;
  activityType?: string;
  startTime?: number; // epoch ms
  totalTime?: number; // seconds
  totalDistance?: number; // meters
  totalAscent?: number;
  hravg?: number;
  hrmax?: number;
  energyConsumption?: number; // kcal
}

export function mapSuuntoActivity(w: SuuntoWorkout): Activity {
  const externalId = String(w.workoutId ?? w.workoutKey ?? "");
  return {
    id: `suunto:${externalId}`,
    provider: "suunto",
    externalId,
    sport: mapSuuntoSport(w.activityType),
    startTime: w.startTime ? new Date(w.startTime).toISOString() : new Date().toISOString(),
    durationSec: Math.round(w.totalTime ?? 0),
    distanceM: w.totalDistance,
    elevationGainM: w.totalAscent,
    avgHr: w.hravg,
    maxHr: w.hrmax,
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
    const res = await this.fetchImpl(this.descriptor.oauth.tokenUrl, {
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
