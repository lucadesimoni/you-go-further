import { describe, expect, it } from "vitest";
import { recommend, computeTarget } from "./recommend";
import type { AthleteInput } from "./types";

const base: AthleteInput = {
  goal: "endurance-performance",
  activity: "cycling",
  durationMin: 120,
  intensity: "moderate",
  bodyWeightKg: 70,
  conditions: "temperate",
  sweatLevel: "average",
};

describe("physiology-driven personalization", () => {
  it("defaults hydration and sodium to estimates without body signals", () => {
    const t = computeTarget(base);
    expect(t.hydrationSource).toBe("estimated");
    expect(t.sodiumSource).toBe("estimated");
  });

  it("uses measured sweat rate for hydration (≈80% replacement)", () => {
    const t = computeTarget({ ...base, physiology: { sweatRateMlPerH: 1400 } });
    expect(t.hydrationSource).toBe("measured");
    expect(t.fluidPerHourMl).toBe(1120); // 1400 * 0.8, rounded to 5
  });

  it("caps measured hydration at gut-absorption ceiling", () => {
    const t = computeTarget({ ...base, physiology: { sweatRateMlPerH: 2500 } });
    expect(t.fluidPerHourMl).toBeLessThanOrEqual(1200);
  });

  it("uses measured sweat sodium directly", () => {
    const t = computeTarget({ ...base, physiology: { sweatSodiumMgPerL: 1100 } });
    expect(t.sodiumSource).toBe("measured");
    expect(t.sodiumPerLitreMg).toBe(1100);
  });

  it("adds a standalone electrolyte for a measured salty sweater", () => {
    const r = recommend({ ...base, physiology: { sweatSodiumMgPerL: 1200 } });
    const during = r.phases.find((p) => p.phase === "during")!;
    expect(during.products.some((p) => p.category === "electrolyte")).toBe(true);
  });

  it("raises recovery carbs when readiness is low", () => {
    const normal = recommend(base);
    const tired = recommend({ ...base, physiology: { readiness: 30 } });
    const carbG = (r: ReturnType<typeof recommend>) =>
      Number(/~(\d+) g carbohydrate/.exec(r.phases.find((p) => p.phase === "post")!.headline)?.[1]);
    expect(carbG(tired)).toBeGreaterThan(carbG(normal));
    expect(tired.notes.some((n) => /readiness is low/i.test(n))).toBe(true);
  });

  it("explains that hydration came from measured data", () => {
    const r = recommend({ ...base, physiology: { sweatRateMlPerH: 1000 } });
    expect(r.notes.some((n) => /measured sweat rate/i.test(n))).toBe(true);
  });

  it("flags suppressed HRV relative to baseline", () => {
    const r = recommend({ ...base, physiology: { hrvMs: 45, hrvBaselineMs: 60 } });
    expect(r.notes.some((n) => /hrv is below your baseline/i.test(n))).toBe(true);
  });
});

describe("computeTarget – carbohydrate scaling", () => {
  it("gives no during-carbs for a short easy session", () => {
    const t = computeTarget({ ...base, durationMin: 40, intensity: "easy" });
    expect(t.carbPerHourG).toBe(0);
    expect(t.carbTotalG).toBe(0);
  });

  it("lands in the 30–60 g/h band for a 2 h moderate session", () => {
    const t = computeTarget(base);
    expect(t.carbPerHourG).toBeGreaterThanOrEqual(30);
    expect(t.carbPerHourG).toBeLessThanOrEqual(60);
  });

  it("pushes past 60 g/h for a long hard race and flags multi-transportable", () => {
    const t = computeTarget({ ...base, durationMin: 240, intensity: "race", goal: "race-preparation" });
    expect(t.carbPerHourG).toBeGreaterThan(60);
    expect(t.requiresMultiTransportable).toBe(true);
  });

  it("never exceeds the 120 g/h ceiling", () => {
    const t = computeTarget({ ...base, durationMin: 600, intensity: "race", goal: "race-preparation" });
    expect(t.carbPerHourG).toBeLessThanOrEqual(120);
  });

  it("scales total carbs with duration", () => {
    const t = computeTarget({ ...base, durationMin: 180 });
    expect(t.carbTotalG).toBe(Math.round(t.carbPerHourG * 3));
  });
});

describe("goal effects", () => {
  it("weight-loss zeroes during-carbs on a short easy session", () => {
    const t = computeTarget({ ...base, goal: "weight-loss", durationMin: 60, intensity: "easy" });
    expect(t.carbPerHourG).toBe(0);
  });

  it("weight-loss still fuels a long hard session", () => {
    const t = computeTarget({ ...base, goal: "weight-loss", durationMin: 180, intensity: "hard" });
    expect(t.carbPerHourG).toBeGreaterThan(0);
  });

  it("race-preparation fuels more aggressively than general-fitness", () => {
    const race = computeTarget({ ...base, goal: "race-preparation" });
    const general = computeTarget({ ...base, goal: "general-fitness" });
    expect(race.carbPerHourG).toBeGreaterThanOrEqual(general.carbPerHourG);
  });
});

describe("hydration & sodium", () => {
  it("raises fluid and sodium in the heat for a heavy sweater", () => {
    const cool = computeTarget({ ...base, conditions: "cool", sweatLevel: "light" });
    const hot = computeTarget({ ...base, conditions: "hot", sweatLevel: "heavy" });
    expect(hot.fluidPerHourMl).toBeGreaterThan(cool.fluidPerHourMl);
    expect(hot.sodiumPerLitreMg).toBeGreaterThan(cool.sodiumPerLitreMg);
  });
});

describe("recommend – product selection", () => {
  it("returns a plan for all three phases", () => {
    const r = recommend(base);
    expect(r.phases.map((p) => p.phase)).toEqual(["pre", "during", "post"]);
  });

  it("only suggests caffeine when the athlete opts in", () => {
    const withCaf = recommend({ ...base, durationMin: 180, intensity: "race", caffeineOk: true });
    const withoutCaf = recommend({ ...base, durationMin: 180, intensity: "race", caffeineOk: false });
    const hasCaf = (r: ReturnType<typeof recommend>) =>
      r.phases.some((ph) => ph.products.some((pr) => (pr.caffeineMg ?? 0) > 0));
    expect(hasCaf(withCaf)).toBe(true);
    expect(hasCaf(withoutCaf)).toBe(false);
  });

  it("adds a standalone electrolyte for heavy sweaters in heat", () => {
    const r = recommend({ ...base, conditions: "hot", sweatLevel: "heavy" });
    const during = r.phases.find((p) => p.phase === "during")!;
    expect(during.products.some((p) => p.category === "electrolyte")).toBe(true);
  });

  it("uses only multi-transportable carb sources at high carb rates", () => {
    const r = recommend({ ...base, durationMin: 240, intensity: "race", goal: "race-preparation" });
    const during = r.phases.find((p) => p.phase === "during")!;
    const carbProducts = during.products.filter((p) => p.carbsG > 5);
    expect(carbProducts.length).toBeGreaterThan(0);
    expect(carbProducts.every((p) => p.multiTransportable)).toBe(true);
  });

  it("recommends only Swiss brands", () => {
    const r = recommend(base);
    const brands = new Set(r.phases.flatMap((p) => p.products.map((pr) => pr.brand)));
    for (const b of brands) expect(["Sponser", "Winforce"]).toContain(b);
  });

  it("always includes a safety/disclaimer note", () => {
    const r = recommend(base);
    expect(r.notes.some((n) => /not medical advice/i.test(n))).toBe(true);
  });
});
