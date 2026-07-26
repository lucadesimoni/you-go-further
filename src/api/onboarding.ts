/**
 * First-run onboarding flag (per browser). Keeps the guided journey a one-time
 * experience without needing a server round-trip; a logged-in build can later
 * move this onto the user record.
 */
const KEY = "ygf.onboarded.v1";

export function isOnboarded(): boolean {
  try {
    return typeof localStorage !== "undefined" && localStorage.getItem(KEY) === "1";
  } catch {
    return false;
  }
}

export function setOnboarded(): void {
  try {
    if (typeof localStorage !== "undefined") localStorage.setItem(KEY, "1");
  } catch {
    /* ignore */
  }
}
