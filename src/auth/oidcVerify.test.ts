import { describe, expect, it, vi } from "vitest";
import { generateKeyPairSync, sign as cryptoSign } from "node:crypto";
import { verifyGoogleIdToken, verifyIdToken, type Jwks } from "./oidcVerify";

// A throwaway RSA keypair; publish its public half as a JWK and sign test tokens.
const { publicKey, privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
const pubJwk = publicKey.export({ format: "jwk" }) as { n: string; e: string };
const KID = "test-key-1";
const jwks: Jwks = { keys: [{ kty: "RSA", kid: KID, n: pubJwk.n, e: pubJwk.e, alg: "RS256" }] };

const b64url = (obj: unknown) => Buffer.from(JSON.stringify(obj)).toString("base64url");

function makeToken(claims: Record<string, unknown>, kid = KID): string {
  const header = b64url({ alg: "RS256", kid, typ: "JWT" });
  const payload = b64url(claims);
  const sig = cryptoSign("RSA-SHA256", Buffer.from(`${header}.${payload}`), privateKey).toString("base64url");
  return `${header}.${payload}.${sig}`;
}

const base = {
  iss: "https://accounts.google.com",
  aud: "my-client-id",
  sub: "user-123",
  email: "alex@gmail.com",
  name: "Alex Athlete",
  exp: Math.floor(Date.now() / 1000) + 3600,
};

describe("verifyIdToken", () => {
  const opts = { jwks, issuer: base.iss, audience: base.aud };

  it("accepts a correctly signed token and returns claims", () => {
    const claims = verifyIdToken(makeToken(base), opts);
    expect(claims.sub).toBe("user-123");
    expect(claims.email).toBe("alex@gmail.com");
  });

  it("rejects a tampered payload", () => {
    const token = makeToken(base);
    const [h, , s] = token.split(".");
    const forged = Buffer.from(JSON.stringify({ ...base, sub: "attacker" })).toString("base64url");
    expect(() => verifyIdToken(`${h}.${forged}.${s}`, opts)).toThrow(/bad signature/);
  });

  it("rejects an expired token", () => {
    expect(() => verifyIdToken(makeToken({ ...base, exp: 1 }), opts)).toThrow(/expired/);
  });

  it("rejects a wrong audience", () => {
    expect(() => verifyIdToken(makeToken({ ...base, aud: "someone-else" }), opts)).toThrow(/audience/);
  });

  it("rejects a wrong issuer", () => {
    expect(() => verifyIdToken(makeToken({ ...base, iss: "https://evil.example" }), opts)).toThrow(/issuer/);
  });

  it("rejects an unknown signing key", () => {
    expect(() => verifyIdToken(makeToken(base, "other-kid"), { ...opts, jwks: { keys: [{ ...jwks.keys[0], kid: "other" }] } })).not.toThrow();
    // A single key is used as fallback; with two keys and no kid match it must fail:
    const two: Jwks = { keys: [{ ...jwks.keys[0], kid: "a" }, { ...jwks.keys[0], kid: "b" }] };
    expect(() => verifyIdToken(makeToken(base, "missing"), { ...opts, jwks: two })).toThrow(/no matching signing key/);
  });
});

describe("verifyGoogleIdToken", () => {
  it("fetches the JWKS and verifies against the Google issuer + audience", async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify(jwks), { status: 200 })) as unknown as typeof fetch;
    const claims = await verifyGoogleIdToken(makeToken(base), "my-client-id", fetchImpl);
    expect(claims.email).toBe("alex@gmail.com");
    expect(fetchImpl).toHaveBeenCalled();
  });
});
