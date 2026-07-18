import type { Activity, ProviderId, SportType } from "../model";

/**
 * Deterministic sample-activity generator. Stands in for a live provider API so
 * the ingestion pipeline, storage, and analysis are fully runnable and testable
 * without OAuth credentials. Real adapters replace this with normalized API data.
 */

// A tiny seeded PRNG so generated data is stable across runs (good for tests).
function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const SPORTS_BY_PROVIDER: Record<ProviderId, SportType[]> = {
  strava: ["run", "ride", "trail-run"],
  garmin: ["run", "ride", "swim", "triathlon"],
  polar: ["run", "ride"],
  suunto: ["trail-run", "run"],
};

function hashSeed(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Generate `count` sessions ending at `before`, one per ~day, for a provider. */
export function generateSampleActivities(
  provider: ProviderId,
  afterIso: string,
  beforeIso: string,
  maxHr = 190,
): Activity[] {
  const after = Date.parse(afterIso);
  const before = Date.parse(beforeIso);
  const dayMs = 86_400_000;
  const rand = mulberry32(hashSeed(provider + afterIso));
  const sports = SPORTS_BY_PROVIDER[provider];
  const out: Activity[] = [];

  // Roughly 4–5 sessions per week within the window.
  for (let t = before - dayMs; t >= after; t -= dayMs) {
    if (rand() > 0.62) continue; // rest day
    const sport = sports[Math.floor(rand() * sports.length)];
    const isLong = rand() > 0.78;
    const durationSec = Math.round((isLong ? 90 + rand() * 120 : 35 + rand() * 55) * 60);
    const hrFrac = 0.62 + rand() * 0.28; // 62–90% of max
    const avgHr = Math.round(maxHr * hrFrac);
    const speedMs = sport === "ride" ? 7 + rand() * 4 : sport === "swim" ? 0.9 + rand() * 0.4 : 2.6 + rand() * 1.6;
    const externalId = `${t}`;
    out.push({
      id: `${provider}:${externalId}`,
      provider,
      externalId,
      sport,
      startTime: new Date(t + Math.floor(rand() * 12) * 3600_000).toISOString(),
      durationSec,
      distanceM: Math.round(durationSec * speedMs),
      elevationGainM: sport.includes("trail") ? Math.round(200 + rand() * 900) : Math.round(rand() * 300),
      avgHr,
      maxHr: Math.min(maxHr, avgHr + Math.round(8 + rand() * 20)),
      avgPowerW: sport === "ride" ? Math.round(160 + rand() * 140) : undefined,
      calories: Math.round((durationSec / 60) * (7 + rand() * 6)),
      trainingLoad: provider === "strava" ? undefined : Math.round((durationSec / 60) * hrFrac * 2.2),
      name: `${sport} session`,
    });
  }
  return out;
}
