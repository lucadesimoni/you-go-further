import { createPublicKey, verify as cryptoVerify } from "node:crypto";

/**
 * Verify an OpenID Connect **ID token** (Google / Apple) against the provider's
 * published public keys. This is the secure, production-correct way to accept a
 * social sign-in: the client obtains an ID token from Google/Apple, sends it to
 * us, and the server proves it was signed by the provider and issued for our app
 * before trusting the identity.
 *
 * Server-only (node:crypto) — NOT re-exported from `auth/index`, so it never
 * reaches the browser bundle.
 */

export interface Jwk {
  kty: string;
  kid?: string;
  n: string;
  e: string;
  alg?: string;
}
export interface Jwks {
  keys: Jwk[];
}

export interface IdTokenClaims {
  iss: string;
  aud: string | string[];
  sub: string;
  exp: number;
  email?: string;
  email_verified?: boolean | string;
  name?: string;
  [k: string]: unknown;
}

export interface VerifyOptions {
  jwks: Jwks;
  issuer: string | string[];
  audience: string;
  /** Unix seconds; defaults to now. */
  now?: number;
}

const decode = (seg: string): string => Buffer.from(seg, "base64url").toString("utf8");

/** Verify an RS256 ID token and return its claims, or throw. */
export function verifyIdToken(idToken: string, opts: VerifyOptions): IdTokenClaims {
  const parts = idToken.split(".");
  if (parts.length !== 3) throw new Error("malformed token");
  const [h, p, s] = parts;

  const header = JSON.parse(decode(h)) as { alg?: string; kid?: string };
  if (header.alg !== "RS256") throw new Error(`unsupported alg: ${header.alg}`);

  const jwk =
    opts.jwks.keys.find((k) => k.kid === header.kid) ??
    (opts.jwks.keys.length === 1 ? opts.jwks.keys[0] : undefined);
  if (!jwk) throw new Error("no matching signing key");

  const key = createPublicKey({ key: { kty: "RSA", n: jwk.n, e: jwk.e }, format: "jwk" });
  const ok = cryptoVerify("RSA-SHA256", Buffer.from(`${h}.${p}`), key, Buffer.from(s, "base64url"));
  if (!ok) throw new Error("bad signature");

  const claims = JSON.parse(decode(p)) as IdTokenClaims;
  const now = opts.now ?? Math.floor(Date.now() / 1000);
  if (typeof claims.exp === "number" && claims.exp < now) throw new Error("token expired");

  const issuers = Array.isArray(opts.issuer) ? opts.issuer : [opts.issuer];
  if (!issuers.includes(claims.iss)) throw new Error(`bad issuer: ${claims.iss}`);

  const auds = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
  if (!auds.includes(opts.audience)) throw new Error("audience mismatch");

  return claims;
}

// --- JWKS fetching (cached) ---
const jwksCache = new Map<string, { jwks: Jwks; fetchedAt: number }>();
const JWKS_TTL_MS = 60 * 60_000;

export async function fetchJwks(url: string, fetchImpl: typeof fetch = fetch): Promise<Jwks> {
  const cached = jwksCache.get(url);
  if (cached && Date.now() - cached.fetchedAt < JWKS_TTL_MS) return cached.jwks;
  const res = await fetchImpl(url);
  if (!res.ok) throw new Error(`JWKS fetch failed: HTTP ${res.status}`);
  const jwks = (await res.json()) as Jwks;
  jwksCache.set(url, { jwks, fetchedAt: Date.now() });
  return jwks;
}

export const GOOGLE_JWKS_URL = "https://www.googleapis.com/oauth2/v3/certs";
export const APPLE_JWKS_URL = "https://appleid.apple.com/auth/keys";

/** Verify a Google ID token for our client id. */
export async function verifyGoogleIdToken(
  idToken: string,
  clientId: string,
  fetchImpl: typeof fetch = fetch,
): Promise<IdTokenClaims> {
  const jwks = await fetchJwks(GOOGLE_JWKS_URL, fetchImpl);
  return verifyIdToken(idToken, {
    jwks,
    issuer: ["https://accounts.google.com", "accounts.google.com"],
    audience: clientId,
  });
}

/** Verify an Apple ID token for our client id (Service ID). */
export async function verifyAppleIdToken(
  idToken: string,
  clientId: string,
  fetchImpl: typeof fetch = fetch,
): Promise<IdTokenClaims> {
  const jwks = await fetchJwks(APPLE_JWKS_URL, fetchImpl);
  return verifyIdToken(idToken, { jwks, issuer: "https://appleid.apple.com", audience: clientId });
}
