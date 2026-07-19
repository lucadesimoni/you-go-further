import { beforeEach, describe, expect, it } from "vitest";
import {
  __resetSessionCache,
  currentAccount,
  signInAsDemo,
  signInWithEmail,
  signInWithProvider,
  signOut,
} from "./session";
import { PERSONAS } from "../personas";

beforeEach(() => {
  __resetSessionCache();
  signOut();
  __resetSessionCache();
});

describe("session", () => {
  it("starts signed out", () => {
    expect(currentAccount()).toBeNull();
  });

  it("signs in with Google and carries an athlete role by default", () => {
    const a = signInWithProvider("google");
    expect(a.authProvider).toBe("google");
    expect(a.email).toContain("@");
    expect(a.role).toBe("athlete");
    expect(a.tier).toBe("free");
    expect(currentAccount()?.id).toBe(a.id);
  });

  it("signs in with Apple", () => {
    const a = signInWithProvider("apple");
    expect(a.authProvider).toBe("apple");
    expect(currentAccount()?.authProvider).toBe("apple");
  });

  it("registers with a valid email and rejects an invalid one", () => {
    expect(signInWithEmail("not-an-email")).toBeNull();
    const a = signInWithEmail("Runner@Example.com", "Runner");
    expect(a).not.toBeNull();
    expect(a!.email).toBe("runner@example.com"); // normalized
    expect(a!.name).toBe("Runner");
  });

  it("signs in as a demo persona, preserving role/tier/org", () => {
    const admin = PERSONAS.find((p) => p.role === "admin")!;
    const a = signInAsDemo(admin);
    expect(a.role).toBe("admin");
    expect(a.tier).toBe(admin.tier);
    expect(a.orgId).toBe(admin.orgId);
    expect(a.authProvider).toBe("demo");
  });

  it("signs out", () => {
    signInWithProvider("google");
    expect(currentAccount()).not.toBeNull();
    signOut();
    expect(currentAccount()).toBeNull();
  });
});
