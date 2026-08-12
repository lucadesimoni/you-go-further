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

/**
 * The write that is still in the air.
 *
 * `saveProfile` returns immediately so typing stays instant, which leaves a
 * window where the new value is in the browser but not yet on the server. A
 * screen that mounts inside that window calls `syncProfile`, reads the *old*
 * server profile, and writes it back over the new one — the athlete watches
 * their weight revert to what it was, with no error and nothing to retry.
 *
 * Reads now queue behind writes, and writes behind each other, so two quick
 * edits cannot land out of order either. It is one shared chain rather than a
 * lock because the only thing that has to be true is the ordering.
 */
let inFlight: Promise<unknown> = Promise.resolve();

/** Pull the authoritative profile from the server (no-op without an API). */
export async function syncProfile(): Promise<AthleteProfile> {
  if (!isApiConfigured()) return loadProfile();
  // Never read past a write that has not landed yet.
  await inFlight;
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
  if (isApiConfigured()) {
    inFlight = inFlight.then(() => api.profileSave(profile)).catch(() => {});
  }
  return profile;
}

/** Where the profile is stored, for honest UI copy. */
export const profilePersistence = { mode: (): "server" | "local" => (isApiConfigured() ? "server" : "local") };
