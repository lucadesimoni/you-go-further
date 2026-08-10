import { signInAsDemo, type Account, type Role } from "../auth";
import { api, isApiConfigured, type NewFeedback } from "./client";
import { getConfig } from "../config";
import type { Persona } from "../personas";
import { loadProfile, saveProfile } from "./profileStore";

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

/**
 * Enter a demo account.
 *
 * "Explore a demo account" promises a *populated* product, so a demo persona
 * skips first-run setup and lands on Home with a training history behind it.
 * Dropping someone into a three-step wizard with an empty app is the opposite
 * of what the button offers — onboarding exists to set up a real athlete, and
 * a demo athlete is already set up.
 *
 * The persona's body profile is seeded too, so the plans on screen are
 * somebody's — a 58 kg trail runner and a 74 kg triathlete get different
 * numbers, which is the whole argument for personalisation and is invisible
 * when every demo starts from the 70 kg default.
 */
export function enterDemo(persona: Persona): Account {
  const account = signInAsDemo(persona);
  saveProfile({ ...loadProfile(), ...persona.profile });
  setOnboarded();
  setOnboardStep(0);
  return account;
}

/**
 * Give a demo athlete a few session logs.
 *
 * Without them the demo can never show the half of the product that learns:
 * the fuelling score reads "not scored yet", and the adaptation the planner
 * derives from real outcomes has nothing to derive from. Three logs is enough
 * to score and to show a trend, and few enough that "log your next session" is
 * still the honest next move.
 *
 * The pattern is deliberately imperfect — a strong long run, a steady one, and
 * one that faded on under-fuelling — because a demo in which everything went
 * well demonstrates nothing. Called once per demo account: an athlete who has
 * logged anything is left alone.
 */
const SEEDED_KEY = "ygf.demoSeeded.v1";

export function demoLogsSeeded(): boolean {
  try {
    return typeof localStorage !== "undefined" && localStorage.getItem(SEEDED_KEY) === "1";
  } catch {
    return false;
  }
}

export async function seedDemoFeedback(
  activities: { id: string; durationSec: number }[],
  role: Role,
  add: (role: Role, entry: NewFeedback) => Promise<unknown>,
): Promise<void> {
  if (demoLogsSeeded()) return;
  try {
    if (typeof localStorage !== "undefined") localStorage.setItem(SEEDED_KEY, "1");
  } catch {
    /* the seed just won't be remembered; the guard below still limits it */
  }
  // Longest first: a debrief is worth most on the sessions where fuelling
  // actually decided something.
  const targets = [...activities].sort((a, b) => b.durationSec - a.durationSec).slice(0, 3);
  const pattern: Pick<NewFeedback, "gi" | "energy" | "actualCarbPerHourG">[] = [
    { gi: "none", energy: "strong", actualCarbPerHourG: 72 },
    { gi: "mild", energy: "steady", actualCarbPerHourG: 65 },
    { gi: "none", energy: "faded", actualCarbPerHourG: 38 },
  ];
  // Sequential and awaited: the store is read straight afterwards to refresh
  // the screen, and firing these off unawaited meant reading it before any of
  // them had landed.
  for (const [i, a] of targets.entries()) {
    await add(role, {
      activityId: a.id,
      durationMin: Math.round(a.durationSec / 60),
      plannedCarbPerHourG: 70,
      ...pattern[i % pattern.length],
    }).catch(() => {});
  }
}

/**
 * Connect a training source for a demo account, without leaving the page.
 *
 * "Explore a demo account" that lands on an empty Home demonstrates nothing —
 * no sessions, no week, no insights, no fuelling score. A real athlete has to
 * choose a provider and go through consent, which is right for them and absurd
 * for someone who clicked "show me the product".
 *
 * This walks the *same* server path the onboarding button does — mint a state
 * bound to the principal, follow the consent stub, let the callback exchange
 * and ingest — rather than injecting activities behind the pipeline's back. It
 * is therefore a real connection, with real ingestion, and the Connect screen
 * shows it as one.
 *
 * A no-op if the account already has a source connected, so it never fights an
 * athlete who chose their own.
 */
export async function connectDemoSource(provider = "strava"): Promise<boolean> {
  if (!isApiConfigured()) return false;
  try {
    const existing = await api.connections();
    if (existing.connections.length > 0) return false;
    const { authorizeUrl } = await api.oauthAuthorizeUrl(provider, "/");
    const base = getConfig().apiBaseUrl;
    const url = authorizeUrl.startsWith("http") ? authorizeUrl : `${base}${authorizeUrl}`;
    // The consent stub 302s to the callback, which does the exchange and the
    // ingest. Following it with fetch keeps the athlete on the page.
    // No auth header: a demo account carries no signed session, so this goes
    // through the same principal resolution as the `api.*` calls above.
    const res = await fetch(url);
    return res.ok;
  } catch {
    return false;
  }
}
