import { describe, expect, it } from "vitest";
import {
  createMagicToken,
  verifyMagicToken,
  magicLinkUrl,
  isEmail,
  InMemoryMagicLinkStore,
} from "./magicLink";

const SECRET = "test-auth-secret";

describe("magic-link tokens", () => {
  it("round-trips a valid token", () => {
    const claims = verifyMagicToken(createMagicToken("Lena@Club.ch", SECRET), SECRET);
    expect(claims?.email).toBe("lena@club.ch"); // normalized
    expect(claims?.jti).toBeTruthy();
  });

  it("rejects a token signed with another secret", () => {
    expect(verifyMagicToken(createMagicToken("a@b.ch", SECRET), "other-secret")).toBeNull();
  });

  it("rejects a tampered payload (can't swap the email)", () => {
    const token = createMagicToken("victim@club.ch", SECRET);
    const [, sig] = token.split(".");
    const forged =
      Buffer.from(JSON.stringify({ email: "attacker@evil.ch", jti: "x", exp: 9e9 }))
        .toString("base64")
        .replace(/\+/g, "-")
        .replace(/\//g, "_")
        .replace(/=+$/, "") + `.${sig}`;
    expect(verifyMagicToken(forged, SECRET)).toBeNull();
  });

  it("rejects an expired token", () => {
    expect(verifyMagicToken(createMagicToken("a@b.ch", SECRET, -10), SECRET)).toBeNull();
  });

  it("rejects malformed input", () => {
    expect(verifyMagicToken("", SECRET)).toBeNull();
    expect(verifyMagicToken("nodot", SECRET)).toBeNull();
  });

  it("builds a link carrying the token", () => {
    const url = magicLinkUrl("https://app.ch/?x=1", "tok");
    expect(url).toBe("https://app.ch/?x=1&magic=tok");
  });

  it("validates email shape", () => {
    expect(isEmail("a@b.ch")).toBe(true);
    expect(isEmail("nope")).toBe(false);
  });
});

describe("single-use enforcement", () => {
  it("consumes a token id exactly once", async () => {
    const store = new InMemoryMagicLinkStore();
    const exp = Math.floor(Date.now() / 1000) + 900;
    expect(await store.consume("jti-1", exp)).toBe(true);
    expect(await store.consume("jti-1", exp)).toBe(false); // replay blocked
    expect(await store.consume("jti-2", exp)).toBe(true);
  });
});
