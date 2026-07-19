import { describe, expect, it } from "vitest";
import { signSession, verifySession } from "./jwt";

const SECRET = "test-secret";
const claims = { sub: "u1", name: "Alex", email: "alex@gmail.com", role: "athlete" as const, tier: "free" as const };

describe("session tokens", () => {
  it("signs and verifies a round-trip", () => {
    const token = signSession(claims, SECRET);
    const out = verifySession(token, SECRET);
    expect(out).not.toBeNull();
    expect(out!.sub).toBe("u1");
    expect(out!.role).toBe("athlete");
    expect(out!.exp).toBeGreaterThan(Date.now() / 1000);
  });

  it("rejects a token signed with a different secret", () => {
    const token = signSession(claims, SECRET);
    expect(verifySession(token, "wrong-secret")).toBeNull();
  });

  it("rejects a tampered payload", () => {
    const token = signSession(claims, SECRET);
    const [, sig] = token.split(".");
    const forged = Buffer.from(JSON.stringify({ ...claims, role: "admin", exp: 9999999999 })).toString("base64url");
    expect(verifySession(`${forged}.${sig}`, SECRET)).toBeNull();
  });

  it("rejects an expired token", () => {
    const token = signSession(claims, SECRET, -10); // already expired
    expect(verifySession(token, SECRET)).toBeNull();
  });

  it("rejects malformed input", () => {
    expect(verifySession("garbage", SECRET)).toBeNull();
    expect(verifySession("", SECRET)).toBeNull();
  });
});
