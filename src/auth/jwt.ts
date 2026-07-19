import { createHmac, timingSafeEqual } from "node:crypto";
import type { Role } from "./roles";
import type { Tier } from "../subscription";

/**
 * Minimal HMAC-signed session tokens (a compact JWT-style `payload.signature`).
 *
 * Server-only (uses node:crypto) — NOT re-exported from `auth/index` so the
 * browser bundle never imports it. Issued by `POST /api/auth/session` and
 * verified on every API request; replaces the `x-role` demo header with a real,
 * tamper-evident session. Set `AUTH_SECRET` in production.
 */

export const DEV_AUTH_SECRET = "ygf-dev-secret-change-me";

export interface SessionClaims {
  sub: string;
  name: string;
  email: string;
  role: Role;
  tier: Tier;
  orgId?: string;
  /** Expiry, seconds since epoch. */
  exp: number;
}

const b64url = (s: string) => Buffer.from(s).toString("base64url");

export function signSession(claims: Omit<SessionClaims, "exp">, secret: string, ttlSec = 7 * 86_400): string {
  const payload: SessionClaims = { ...claims, exp: Math.floor(Date.now() / 1000) + ttlSec };
  const body = b64url(JSON.stringify(payload));
  const sig = createHmac("sha256", secret).update(body).digest("base64url");
  return `${body}.${sig}`;
}

export function verifySession(token: string, secret: string): SessionClaims | null {
  const [body, sig] = token.split(".");
  if (!body || !sig) return null;
  const expected = createHmac("sha256", secret).update(body).digest("base64url");
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const claims = JSON.parse(Buffer.from(body, "base64url").toString()) as SessionClaims;
    if (typeof claims.exp !== "number" || claims.exp < Date.now() / 1000) return null;
    return claims;
  } catch {
    return null;
  }
}
