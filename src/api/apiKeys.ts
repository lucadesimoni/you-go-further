import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * Per-tenant API keys for the public engine.
 *
 * The vision's Phase 6 says the engine, not the app, is the product — licensed
 * to a wearable maker or a training platform. A licensing conversation needs
 * three things this file provides: a credential that identifies *which* partner
 * is calling, a way to revoke it without a deploy, and a record of what they
 * actually used.
 *
 * Server-only (`node:crypto`), like `auth/jwt.ts`, and deliberately not
 * re-exported from anything the browser bundle imports.
 *
 * **The key is never stored.** Only a SHA-256 hash is kept, so a leaked database
 * does not hand over working credentials — the same reason nobody stores
 * passwords. The plaintext is returned exactly once, at issue, and the UI says
 * so. What *is* stored is the prefix, which is enough to tell two keys apart in
 * a list without being enough to use one.
 */

/** What a key is allowed to call. Least privilege: a watch needs `plan`, not `catalog:write`. */
export type ApiScope = "plan" | "course" | "catalog" | "cohort";

export const ALL_SCOPES: ApiScope[] = ["plan", "course", "catalog", "cohort"];

export interface ApiKey {
  id: string;
  /** The licensee. One partner may hold several keys (staging, production, a pilot). */
  tenantId: string;
  /** Human label, so a key can be revoked by the right person for the right reason. */
  name: string;
  /** SHA-256 of the plaintext. The plaintext itself is gone the moment it is issued. */
  hash: string;
  /** The leading, non-secret part — enough to identify a key, not enough to use it. */
  prefix: string;
  scopes: ApiScope[];
  /** Requests per minute. A licence tier is mostly this number. */
  rateLimitPerMin: number;
  createdAt: string;
  lastUsedAt?: string;
  revokedAt?: string;
}

export interface ApiKeyStore {
  create(key: ApiKey): Promise<ApiKey>;
  list(tenantId?: string): Promise<ApiKey[]>;
  /** Look up by hash — the only way in, since the plaintext is never stored. */
  findByHash(hash: string): Promise<ApiKey | undefined>;
  update(id: string, patch: Partial<ApiKey>): Promise<ApiKey | undefined>;
}

/** `ygf_live_` in production, `ygf_test_` everywhere else — a leaked test key is not an incident. */
export const keyPrefixFor = (environment: string): string =>
  environment === "production" ? "ygf_live_" : "ygf_test_";

export const hashKey = (plaintext: string): string => createHash("sha256").update(plaintext).digest("hex");

export interface IssuedKey {
  key: ApiKey;
  /**
   * The plaintext, returned exactly once. There is no second chance to read it,
   * by design — if it is lost, issue another and revoke this one.
   */
  secret: string;
}

export function issueApiKey(input: {
  tenantId: string;
  name: string;
  scopes?: ApiScope[];
  rateLimitPerMin?: number;
  environment?: string;
  now?: Date;
}): IssuedKey {
  const now = input.now ?? new Date();
  // 32 bytes of randomness: far past guessing, and short enough to paste.
  const secret = `${keyPrefixFor(input.environment ?? "development")}${randomBytes(24).toString("base64url")}`;
  const scopes = (input.scopes ?? ["plan"]).filter((s) => ALL_SCOPES.includes(s));
  return {
    secret,
    key: {
      id: `k_${randomBytes(8).toString("hex")}`,
      tenantId: input.tenantId,
      name: input.name.trim() || "Unnamed key",
      hash: hashKey(secret),
      // Enough to recognise, not enough to use: the random part stays hidden.
      prefix: secret.slice(0, secret.indexOf("_", 4) + 1 + 6),
      scopes: scopes.length > 0 ? scopes : ["plan"],
      rateLimitPerMin: Math.max(1, Math.min(6000, Math.round(input.rateLimitPerMin ?? 60))),
      createdAt: now.toISOString(),
    },
  };
}

export type KeyRejection = "missing" | "unknown" | "revoked" | "scope";

export interface KeyCheck {
  ok: boolean;
  key?: ApiKey;
  reason?: KeyRejection;
}

/**
 * Resolve a presented credential to a key.
 *
 * Compared by hash in constant time. A plain `===` on secrets leaks their
 * contents through timing, which is the kind of bug that is invisible until it
 * is in someone's talk.
 */
export async function checkApiKey(
  presented: string | undefined,
  store: ApiKeyStore,
  required?: ApiScope,
): Promise<KeyCheck> {
  const secret = (presented ?? "").trim();
  if (!secret) return { ok: false, reason: "missing" };

  const found = await store.findByHash(hashKey(secret));
  if (!found) return { ok: false, reason: "unknown" };

  // The lookup above already matched on a hash; this is the constant-time
  // confirmation, so a store that did something looser cannot let one through.
  const a = Buffer.from(hashKey(secret));
  const b = Buffer.from(found.hash);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return { ok: false, reason: "unknown" };

  if (found.revokedAt) return { ok: false, reason: "revoked" };
  if (required && !found.scopes.includes(required)) return { ok: false, key: found, reason: "scope" };
  return { ok: true, key: found };
}

/** Strip the hash before a key is ever shown to anyone. */
export function publicKeyView(key: ApiKey): Omit<ApiKey, "hash"> {
  const { hash: _hash, ...rest } = key;
  return rest;
}

export class InMemoryApiKeyStore implements ApiKeyStore {
  private keys: ApiKey[] = [];

  async create(key: ApiKey): Promise<ApiKey> {
    this.keys = [key, ...this.keys];
    return key;
  }

  async list(tenantId?: string): Promise<ApiKey[]> {
    return tenantId === undefined ? this.keys : this.keys.filter((k) => k.tenantId === tenantId);
  }

  async findByHash(hash: string): Promise<ApiKey | undefined> {
    return this.keys.find((k) => k.hash === hash);
  }

  async update(id: string, patch: Partial<ApiKey>): Promise<ApiKey | undefined> {
    const i = this.keys.findIndex((k) => k.id === id);
    if (i < 0) return undefined;
    // id, tenant and hash are not patchable: changing them would silently turn
    // one licensee's key into another's.
    const { id: _i, tenantId: _t, hash: _h, ...safe } = patch;
    this.keys[i] = { ...this.keys[i], ...safe };
    return this.keys[i];
  }
}
