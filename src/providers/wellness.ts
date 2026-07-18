import type { ProviderId, Wellness } from "../model";
import { DESCRIPTORS } from "./descriptors";

/**
 * Deterministic sample wellness generator — the device-measured body signals
 * (resting HR, HRV, readiness, sleep) a real adapter would pull from the
 * provider's wellness/health endpoint. Only providers whose descriptor advertises
 * `trainingLoad`/`sleep` report readiness & HRV (Strava does not).
 */
function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hashSeed(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Generate one wellness reading per day for `days` back from `now`. */
export function generateSampleWellness(provider: ProviderId, days = 14, now = new Date()): Wellness[] {
  const caps = DESCRIPTORS[provider].capabilities;
  const hasReadiness = caps.trainingLoad || caps.sleep;
  const rand = mulberry32(hashSeed(`wellness:${provider}`));
  const out: Wellness[] = [];
  const restBase = 46 + Math.floor(rand() * 8);
  const hrvBase = 55 + Math.floor(rand() * 30);
  for (let d = 0; d < days; d++) {
    const date = new Date(now.getTime() - d * 86_400_000).toISOString().slice(0, 10);
    const swing = (rand() - 0.5) * 2; // -1..1
    out.push({
      provider,
      date,
      restingHr: restBase + Math.round(swing * 4),
      hrvMs: hasReadiness ? Math.max(25, Math.round(hrvBase + swing * 12)) : undefined,
      readiness: hasReadiness ? Math.min(100, Math.max(15, Math.round(62 + swing * 30))) : undefined,
      sleepScore: caps.sleep ? Math.min(100, Math.max(40, Math.round(75 + swing * 18))) : undefined,
    });
  }
  return out;
}
