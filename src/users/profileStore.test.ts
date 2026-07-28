import { describe, it, expect } from "vitest";
import { DEFAULT_PROFILE, InMemoryProfileStore, normalizeProfile } from "./profileStore";

describe("normalizeProfile", () => {
  it("keeps values inside human ranges", () => {
    expect(normalizeProfile({ bodyWeightKg: 71.6 }).bodyWeightKg).toBe(72);
    expect(normalizeProfile({ bodyWeightKg: 5 }).bodyWeightKg).toBe(30);
    expect(normalizeProfile({ bodyWeightKg: 900 }).bodyWeightKg).toBe(200);
  });

  it("accepts a max heart rate and clamps the impossible ones", () => {
    expect(normalizeProfile({ maxHrBpm: 186 }).maxHrBpm).toBe(186);
    // A resting-rate typo or a sensor spike must not poison intensity inference.
    expect(normalizeProfile({ maxHrBpm: 40 }).maxHrBpm).toBe(120);
    expect(normalizeProfile({ maxHrBpm: 400 }).maxHrBpm).toBe(230);
  });

  it("drops anything it does not recognise, rather than trusting the client", () => {
    const out = normalizeProfile({ bodyWeightKg: 70, evil: "yes" } as never) as Record<string, unknown>;
    expect(out.evil).toBeUndefined();
    expect(out.bodyWeightKg).toBe(70);
  });

  it("ignores fields of the wrong type", () => {
    expect(normalizeProfile({ maxHrBpm: "190" } as never).maxHrBpm).toBeUndefined();
    expect(normalizeProfile({ caffeineOk: "yes" } as never).caffeineOk).toBeUndefined();
  });
});

describe("InMemoryProfileStore", () => {
  it("starts every athlete on the shared defaults", async () => {
    const store = new InMemoryProfileStore();
    expect(await store.get("u1")).toEqual(DEFAULT_PROFILE);
    // The default max HR has to exist, or the analysis has nothing to infer from.
    expect(DEFAULT_PROFILE.maxHrBpm).toBeGreaterThan(0);
  });

  it("round-trips a saved max heart rate", async () => {
    const store = new InMemoryProfileStore();
    const saved = await store.save("u1", { maxHrBpm: 178 });
    expect(saved.maxHrBpm).toBe(178);
    expect((await store.get("u1")).maxHrBpm).toBe(178);
  });

  it("merges a patch instead of replacing the whole profile", async () => {
    const store = new InMemoryProfileStore();
    await store.save("u1", { bodyWeightKg: 64 });
    await store.save("u1", { maxHrBpm: 182 });
    const p = await store.get("u1");
    expect(p.bodyWeightKg).toBe(64);
    expect(p.maxHrBpm).toBe(182);
  });

  it("keeps athletes apart", async () => {
    const store = new InMemoryProfileStore();
    await store.save("u1", { bodyWeightKg: 64 });
    expect((await store.get("u2")).bodyWeightKg).toBe(DEFAULT_PROFILE.bodyWeightKg);
  });
});
