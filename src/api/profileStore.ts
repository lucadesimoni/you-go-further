import type { SweatLevel } from "../engine";

/**
 * The athlete's own body + health profile — the personalization data that
 * belongs to *them*, not to a single session. It used to clutter the planner
 * form; now it lives in Profile settings and the planner reads from it. Stored
 * per-browser in localStorage (it's device-local health data); a logged-in build
 * can later sync it server-side.
 */
export interface AthleteProfile {
  bodyWeightKg: number;
  sweatLevel: SweatLevel;
  /** Whether the athlete tolerates caffeine and wants it suggested. */
  caffeineOk: boolean;
  /** Whether to use measured body signals below instead of population estimates. */
  useSignals: boolean;
  sweatRateMlPerH: number;
  sweatSodiumMgPerL: number;
  readiness: number;
  /** Label of the health platform the signals were last synced from, if any. */
  syncedFrom?: string;
}

export const DEFAULT_PROFILE: AthleteProfile = {
  bodyWeightKg: 70,
  sweatLevel: "average",
  caffeineOk: false,
  useSignals: false,
  sweatRateMlPerH: 1000,
  sweatSodiumMgPerL: 800,
  readiness: 65,
};

const KEY = "ygf.profile.v1";

export function loadProfile(): AthleteProfile {
  try {
    const raw = typeof localStorage !== "undefined" ? localStorage.getItem(KEY) : null;
    return raw ? { ...DEFAULT_PROFILE, ...(JSON.parse(raw) as Partial<AthleteProfile>) } : DEFAULT_PROFILE;
  } catch {
    return DEFAULT_PROFILE;
  }
}

export function saveProfile(profile: AthleteProfile): AthleteProfile {
  try {
    if (typeof localStorage !== "undefined") localStorage.setItem(KEY, JSON.stringify(profile));
  } catch {
    /* ignore quota / disabled storage */
  }
  return profile;
}
