import { DEFAULT_PROFILE, type AthleteProfile } from "../users/profileStore";
import { api, isApiConfigured } from "./client";

/**
 * Client access to the athlete's body & health profile.
 *
 * The profile lives **on the server** so it follows the athlete across devices;
 * localStorage is a synchronous cache so the planner can render immediately and
 * so the API-less build still works. Writes update the cache first, then push to
 * the server.
 */
export { DEFAULT_PROFILE, type AthleteProfile };

const KEY = "ygf.profile.v1";

/** Cached profile — synchronous, safe to call during render. */
export function loadProfile(): AthleteProfile {
  try {
    const raw = typeof localStorage !== "undefined" ? localStorage.getItem(KEY) : null;
    return raw ? { ...DEFAULT_PROFILE, ...(JSON.parse(raw) as Partial<AthleteProfile>) } : DEFAULT_PROFILE;
  } catch {
    return DEFAULT_PROFILE;
  }
}

function writeCache(profile: AthleteProfile): AthleteProfile {
  try {
    if (typeof localStorage !== "undefined") localStorage.setItem(KEY, JSON.stringify(profile));
  } catch {
    /* ignore quota / disabled storage */
  }
  return profile;
}

/** Pull the authoritative profile from the server (no-op without an API). */
export async function syncProfile(): Promise<AthleteProfile> {
  if (!isApiConfigured()) return loadProfile();
  try {
    const { profile } = await api.profileGet();
    return writeCache({ ...DEFAULT_PROFILE, ...profile });
  } catch {
    return loadProfile();
  }
}

/** Save locally for instant feedback, then persist to the server. */
export function saveProfile(profile: AthleteProfile): AthleteProfile {
  writeCache(profile);
  if (isApiConfigured()) void api.profileSave(profile).catch(() => {});
  return profile;
}

/** Where the profile is stored, for honest UI copy. */
export const profilePersistence = { mode: (): "server" | "local" => (isApiConfigured() ? "server" : "local") };
