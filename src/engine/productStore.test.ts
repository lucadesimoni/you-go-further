import { describe, expect, it } from "vitest";
import { CATALOG } from "./catalog";
import { InMemoryProductStore, mergeCatalog, normalizeProduct } from "./productStore";

describe("normalizeProduct", () => {
  it("normalizes a valid product and flags it Swiss + custom", () => {
    const p = normalizeProduct({
      name: "  Hydration  ",
      brand: "MOOV",
      category: "drink-mix",
      phases: ["during"],
      carbsG: 16,
      sodiumMg: 500,
    });
    expect(p.name).toBe("Hydration");
    expect(p.swiss).toBe(true);
    expect(p.custom).toBe(true);
    expect(p.id).toContain("custom-moov");
  });

  it("requires name, brand and at least one phase", () => {
    expect(() => normalizeProduct({ brand: "MOOV", phases: ["during"] })).toThrow(/name/i);
    expect(() => normalizeProduct({ name: "X", phases: ["during"] })).toThrow(/brand/i);
    expect(() => normalizeProduct({ name: "X", brand: "MOOV", phases: [] })).toThrow(/phase/i);
  });

  it("rejects explicitly non-Swiss products (Swiss-only curation)", () => {
    expect(() => normalizeProduct({ name: "X", brand: "Y", phases: ["during"], swiss: false })).toThrow(/swiss/i);
  });

  it("validates numeric ranges", () => {
    expect(() => normalizeProduct({ name: "X", brand: "Y", phases: ["during"], carbsG: -5 })).toThrow(/carb/i);
    expect(() => normalizeProduct({ name: "X", brand: "Y", phases: ["during"], caffeineMg: 9000 })).toThrow(/caffeine/i);
  });

  it("keeps an explicit id so edits overwrite in place", () => {
    const p = normalizeProduct({ id: "sponser-competition", name: "Competition", brand: "Sponser", phases: ["during"] });
    expect(p.id).toBe("sponser-competition");
  });
});

describe("mergeCatalog", () => {
  it("appends new custom products", () => {
    const custom = normalizeProduct({ name: "House Mix", brand: "House", phases: ["during"], carbsG: 40 });
    const merged = mergeCatalog([custom]);
    expect(merged.length).toBe(CATALOG.length + 1);
    expect(merged.find((p) => p.id === custom.id)).toBeTruthy();
  });

  it("overrides a built-in when ids collide", () => {
    const override = normalizeProduct({ id: "sponser-competition", name: "Competition X", brand: "Sponser", phases: ["during"], carbsG: 99 });
    const merged = mergeCatalog([override]);
    expect(merged.length).toBe(CATALOG.length);
    expect(merged.find((p) => p.id === "sponser-competition")?.carbsG).toBe(99);
  });
});

describe("InMemoryProductStore", () => {
  it("upserts, lists and removes", async () => {
    const store = new InMemoryProductStore();
    const p = normalizeProduct({ name: "House Gel", brand: "House", phases: ["during"], carbsG: 25 });
    await store.upsert(p);
    expect(await store.list()).toHaveLength(1);
    await store.remove(p.id);
    expect(await store.list()).toHaveLength(0);
  });
});
