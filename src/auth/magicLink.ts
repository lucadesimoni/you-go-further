import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";

/**
 * Passwordless email sign-in. A magic-link token is an HMAC-signed, expiring,
 * single-use claim that the bearer controls the address. This replaces the old
 * client-side email "login", which trusted whatever address was typed.
 *
 * Server-only (node:crypto) — never re-exported from `auth/index`.
 */
export interface MagicClaims {
  email: string;
  /** Token id, so a link can only be redeemed once. */
  jti: string;
  /** Unix seconds. */
  exp: number;
}

/** Records redeemed tokens so a link cannot be replayed. */
export interface MagicLinkStore {
  /** Returns true if this token id was unused (and is now consumed). */
  consume(jti: string, expUnix: number): Promise<boolean>;
}

export class InMemoryMagicLinkStore implements MagicLinkStore {
  private readonly used = new Map<string, number>();

  async consume(jti: string, expUnix: number): Promise<boolean> {
    const now = Math.floor(Date.now() / 1000);
    for (const [k, exp] of this.used) if (exp < now) this.used.delete(k); // prune
    if (this.used.has(jti)) return false;
    this.used.set(jti, expUnix);
    return true;
  }
}

const b64url = (buf: Buffer | string) =>
  Buffer.from(buf).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const fromB64url = (s: string) => Buffer.from(s.replace(/-/g, "+").replace(/_/g, "/"), "base64");

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
export const isEmail = (v: string): boolean => EMAIL_RE.test(v);

/** Create a signed magic-link token for an email address. */
export function createMagicToken(email: string, secret: string, ttlSec = 900): string {
  const claims: MagicClaims = {
    email: email.trim().toLowerCase(),
    jti: randomUUID(),
    exp: Math.floor(Date.now() / 1000) + ttlSec,
  };
  const payload = b64url(JSON.stringify(claims));
  const sig = b64url(createHmac("sha256", secret).update(payload).digest());
  return `${payload}.${sig}`;
}

/** Verify signature + expiry. Returns the claims, or null if the token is bad. */
export function verifyMagicToken(token: string, secret: string): MagicClaims | null {
  const [payload, sig] = token.split(".");
  if (!payload || !sig) return null;
  const expected = b64url(createHmac("sha256", secret).update(payload).digest());
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const claims = JSON.parse(fromB64url(payload).toString("utf8")) as MagicClaims;
    if (!claims.email || !claims.jti || typeof claims.exp !== "number") return null;
    if (claims.exp < Math.floor(Date.now() / 1000)) return null;
    return claims;
  } catch {
    return null;
  }
}

/** Build the link an athlete clicks in their inbox. */
export function magicLinkUrl(baseUrl: string, token: string): string {
  const sep = baseUrl.includes("?") ? "&" : "?";
  return `${baseUrl}${sep}magic=${encodeURIComponent(token)}`;
}
