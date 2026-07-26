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

/**
 * Which onboarding step to resume at. Connecting a device leaves the page for
 * the provider's consent screen, so the step is persisted and restored on return
 * — the athlete never loses their place (or skips the body setup).
 */
const STEP_KEY = "ygf.onboardStep.v1";

export function getOnboardStep(): number {
  try {
    const v = typeof localStorage !== "undefined" ? localStorage.getItem(STEP_KEY) : null;
    const n = v ? Number(v) : 0;
    return Number.isFinite(n) && n >= 0 && n <= 3 ? n : 0;
  } catch {
    return 0;
  }
}

export function setOnboardStep(step: number): void {
  try {
    if (typeof localStorage !== "undefined") localStorage.setItem(STEP_KEY, String(step));
  } catch {
    /* ignore */
  }
}
