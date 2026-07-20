import { getConfig } from "../config";
import { api, isApiConfigured, setSessionToken } from "../api/client";
import type { Account } from "./account";
import type { Role } from "./roles";
import type { Tier } from "../subscription";

/**
 * Real social sign-in on the client. When a provider client id is configured
 * (`googleClientId` / `appleClientId`) AND an API is reachable, this runs the
 * provider's real flow, gets an ID token, and exchanges it at `/api/auth/*` for
 * our signed session. Otherwise the caller falls back to the simulated flow.
 *
 * The provider SDKs (Google Identity Services / Sign in with Apple JS) are loaded
 * on demand and only when configured, so nothing external loads in the demo.
 */

export function googleConfigured(): boolean {
  return Boolean(getConfig().googleClientId) && isApiConfigured();
}
export function appleConfigured(): boolean {
  return Boolean(getConfig().appleClientId) && isApiConfigured();
}

function loadScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[src="${src}"]`)) return resolve();
    const el = document.createElement("script");
    el.src = src;
    el.async = true;
    el.onload = () => resolve();
    el.onerror = () => reject(new Error(`failed to load ${src}`));
    document.head.appendChild(el);
  });
}

const b64urlToJson = (seg: string): string => atob(seg.replace(/-/g, "+").replace(/_/g, "/"));

/** Decode our own session JWT payload into an Account (already server-verified). */
function accountFromToken(token: string, authProvider: Account["authProvider"]): Account {
  const payload = JSON.parse(b64urlToJson(token.split(".")[0])) as {
    sub: string;
    name: string;
    email: string;
    role: Role;
    tier: Tier;
    orgId?: string;
  };
  return {
    id: payload.sub,
    name: payload.name,
    email: payload.email,
    role: payload.role,
    tier: payload.tier,
    orgId: payload.orgId,
    authProvider,
    createdAt: new Date().toISOString(),
  };
}

interface GoogleId {
  accounts: {
    id: {
      initialize(cfg: { client_id: string; callback: (r: { credential: string }) => void }): void;
      prompt(): void;
    };
  };
}

/** Real Google sign-in via Google Identity Services. Resolves to an Account. */
export async function signInWithGoogleReal(): Promise<Account> {
  const clientId = getConfig().googleClientId;
  await loadScript("https://accounts.google.com/gsi/client");
  const google = (globalThis as unknown as { google?: GoogleId }).google;
  if (!google) throw new Error("Google Identity Services unavailable");
  const idToken = await new Promise<string>((resolve, reject) => {
    google.accounts.id.initialize({ client_id: clientId, callback: (r) => (r.credential ? resolve(r.credential) : reject(new Error("no credential"))) });
    google.accounts.id.prompt();
  });
  const { token } = await api.googleSignIn(idToken);
  setSessionToken(token);
  return accountFromToken(token, "google");
}

interface AppleId {
  auth: {
    init(cfg: { clientId: string; scope: string; redirectURI: string; usePopup: boolean }): void;
    signIn(): Promise<{ authorization: { id_token: string }; user?: { name?: { firstName?: string; lastName?: string } } }>;
  };
}

/** Real Apple sign-in via Sign in with Apple JS. Resolves to an Account. */
export async function signInWithAppleReal(): Promise<Account> {
  const clientId = getConfig().appleClientId;
  await loadScript("https://appleid.cdn-apple.com/appleauth/static/jsapi/appleid/1/en_US/appleid.auth.js");
  const AppleID = (globalThis as unknown as { AppleID?: AppleId }).AppleID;
  if (!AppleID) throw new Error("Sign in with Apple unavailable");
  AppleID.auth.init({ clientId, scope: "name email", redirectURI: window.location.origin, usePopup: true });
  const res = await AppleID.auth.signIn();
  const name = [res.user?.name?.firstName, res.user?.name?.lastName].filter(Boolean).join(" ") || undefined;
  const { token } = await api.appleSignIn(res.authorization.id_token, name);
  setSessionToken(token);
  return accountFromToken(token, "apple");
}
