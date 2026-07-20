import type { Account, AuthProviderId } from "./account";
import type { Principal } from "./roles";

/**
 * Client-side session management.
 *
 * Dev/mock identity: "Continue with Google/Apple" and email register complete a
 * simulated round-trip and create a local account, so the whole app runs without
 * real OAuth credentials. In production these are replaced by:
 *   - Google → Google Identity Services (client id) or a server OAuth callback,
 *   - Apple  → Sign in with Apple (server verifies the identity token),
 *   - email  → a real sign-up / magic-link backed by the API.
 * The session shape and gating stay identical; only the token acquisition changes.
 */

const KEY = "ygf.session.v1";
let cached: Account | null | undefined; // undefined = not yet loaded

function hasStorage(): boolean {
  return typeof localStorage !== "undefined";
}

function load(): Account | null {
  if (cached !== undefined) return cached;
  try {
    const raw = hasStorage() ? localStorage.getItem(KEY) : null;
    cached = raw ? (JSON.parse(raw) as Account) : null;
  } catch {
    cached = null;
  }
  return cached;
}

function persist(account: Account | null): Account | null {
  cached = account;
  try {
    if (!hasStorage()) return account;
    if (account) localStorage.setItem(KEY, JSON.stringify(account));
    else localStorage.removeItem(KEY);
  } catch {
    /* ignore quota / disabled storage */
  }
  return account;
}

/** The currently signed-in account, or null. */
export function currentAccount(): Account | null {
  return load();
}

/** Identity a mock provider "returns" for the demo. */
const PROVIDER_IDENTITY: Record<"google" | "apple", { name: string; email: string }> = {
  google: { name: "Alex Athlete", email: "alex@gmail.com" },
  apple: { name: "Sam Athlete", email: "sam@icloud.com" },
};

/** Complete a (mock) social sign-in and start a session. */
export function signInWithProvider(provider: "google" | "apple"): Account {
  const id = PROVIDER_IDENTITY[provider];
  return persist({
    id: `${provider}:${id.email}`,
    name: id.name,
    email: id.email,
    authProvider: provider,
    role: "athlete",
    tier: "free",
    createdAt: new Date().toISOString(),
  })!;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Register / sign in with an email address. Returns null if the email is invalid. */
export function signInWithEmail(email: string, name?: string): Account | null {
  const trimmed = email.trim().toLowerCase();
  if (!EMAIL_RE.test(trimmed)) return null;
  return persist({
    id: `email:${trimmed}`,
    name: name?.trim() || trimmed.split("@")[0],
    email: trimmed,
    authProvider: "email",
    role: "athlete",
    tier: "free",
    createdAt: new Date().toISOString(),
  });
}

/** Persist an account authenticated elsewhere (e.g. real Google/Apple sign-in). */
export function saveAccount(account: Account): Account {
  return persist(account)!;
}

/** Sign in as a built-in demo persona (to explore coach/admin views). */
export function signInAsDemo(persona: Principal): Account {
  return persist({
    ...persona,
    email: `${persona.id}@demo.yougofurther.ch`,
    authProvider: "demo",
    createdAt: new Date().toISOString(),
  })!;
}

/** End the session. */
export function signOut(): null {
  persist(null);
  return null;
}

/** Test helper: reset the in-memory cache. */
export function __resetSessionCache(): void {
  cached = undefined;
}

export type { Account, AuthProviderId };
