import { describe, expect, it, vi, beforeEach } from "vitest";

/**
 * The race that made an athlete's weight revert.
 *
 * `saveProfile` returns before the server has the value, so a screen that
 * mounts immediately afterwards used to `syncProfile()` straight past it: the
 * GET was issued before the POST, came back with the *old* profile, and wrote
 * it over the new one. Nothing errored — the number simply changed back.
 *
 * The fix is ordering, so the test is about ordering: with a save in flight, a
 * read must not reach the server first.
 */
const calls: string[] = [];
let resolveSave: (() => void) | undefined;

// The suite runs in Node, where there is no localStorage. The cache is the
// point of this module, so give it the smallest thing that behaves like one.
const cache = new Map<string, string>();
vi.stubGlobal("localStorage", {
  getItem: (k: string) => cache.get(k) ?? null,
  setItem: (k: string, v: string) => void cache.set(k, v),
  removeItem: (k: string) => void cache.delete(k),
  clear: () => cache.clear(),
});

vi.mock("./client", () => ({
  isApiConfigured: () => true,
  api: {
    profileSave: (patch: { bodyWeightKg?: number }) => {
      calls.push(`save:${patch.bodyWeightKg}`);
      // A save that has not come back yet — the whole window in question.
      return new Promise<{ profile: unknown }>((res) => {
        resolveSave = () => res({ profile: patch });
      });
    },
    profileGet: () => {
      calls.push("get");
      return Promise.resolve({ profile: { bodyWeightKg: 70 } });
    },
  },
}));

const { saveProfile, syncProfile, loadProfile, DEFAULT_PROFILE } = await import("./profileStore");

describe("the profile cache", () => {
  beforeEach(() => {
    calls.length = 0;
    resolveSave = undefined;
    localStorage.clear();
  });

  it("does not read the server past a save that is still in flight", async () => {
    saveProfile({ ...DEFAULT_PROFILE, bodyWeightKg: 83 });
    expect(loadProfile().bodyWeightKg).toBe(83);

    const read = syncProfile();
    // Give the read every chance to jump the queue.
    await Promise.resolve();
    await Promise.resolve();
    expect(calls).toEqual(["save:83"]);

    resolveSave?.();
    await read;
    expect(calls).toEqual(["save:83", "get"]);
  });

  it("keeps two quick edits in the order they were made", async () => {
    saveProfile({ ...DEFAULT_PROFILE, bodyWeightKg: 81 });
    // The POST starts on the next microtask, the way it does after a keystroke.
    await Promise.resolve();
    const first = resolveSave;
    expect(calls).toEqual(["save:81"]);

    saveProfile({ ...DEFAULT_PROFILE, bodyWeightKg: 83 });
    await Promise.resolve();
    // The second save must not have started while the first is unfinished.
    expect(calls).toEqual(["save:81"]);

    first?.();
    await new Promise((r) => setTimeout(r, 0));
    expect(calls).toEqual(["save:81", "save:83"]);
    // And the cache always shows the newest value, whatever the network does.
    expect(loadProfile().bodyWeightKg).toBe(83);
  });
});
