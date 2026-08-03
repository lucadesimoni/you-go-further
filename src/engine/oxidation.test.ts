import { describe, it, expect } from "vitest";
import {
  absorptionCeiling,
  carbBurnPerHourG,
  carbEnergyFraction,
  checkDeliverable,
  productCarbSources,
  sumCarbSources,
  GLUCOSE_ONLY_CEILING_G_PER_H,
  MULTI_TRANSPORTABLE_CEILING_G_PER_H,
} from "./oxidation";
import type { Product } from "./types";

const product = (over: Partial<Product> = {}): Product => ({
  id: "p",
  name: "Test",
  brand: "Test",
  category: "gel",
  phases: ["during"],
  carbsG: 30,
  sodiumMg: 50,
  servingLabel: "1 gel",
  ...over,
});

describe("absorptionCeiling", () => {
  it("caps glucose-only at the single-transporter limit", () => {
    const c = absorptionCeiling({ glucoseG: 90, fructoseG: 0 });
    expect(c.ceilingG).toBe(GLUCOSE_ONLY_CEILING_G_PER_H);
    expect(c.multiTransportable).toBe(false);
    // Eating more glucose does not move it — that is the whole point.
    expect(absorptionCeiling({ glucoseG: 200, fructoseG: 0 }).ceilingG).toBe(GLUCOSE_ONLY_CEILING_G_PER_H);
  });

  it("lifts the ceiling for a 2:1 blend", () => {
    const c = absorptionCeiling({ glucoseG: 60, fructoseG: 30 });
    expect(c.ceilingG).toBe(MULTI_TRANSPORTABLE_CEILING_G_PER_H);
    expect(c.multiTransportable).toBe(true);
    expect(c.ratio).toBe(2);
  });

  it("does not count a token amount of fructose as a second route", () => {
    // 90:5 is a glucose drink with a garnish, and behaves like one.
    const c = absorptionCeiling({ glucoseG: 90, fructoseG: 5 });
    expect(c.multiTransportable).toBe(false);
    expect(c.ceilingG).toBe(GLUCOSE_ONLY_CEILING_G_PER_H);
  });

  it("accepts the useful band around 2:1 and rejects the extremes", () => {
    expect(absorptionCeiling({ glucoseG: 50, fructoseG: 50 }).multiTransportable).toBe(true); // 1:1
    expect(absorptionCeiling({ glucoseG: 75, fructoseG: 25 }).multiTransportable).toBe(true); // 3:1
    expect(absorptionCeiling({ glucoseG: 80, fructoseG: 20 }).multiTransportable).toBe(false); // 4:1
  });

  it("lets gut training raise the ceiling, but only with the transporters to support it", () => {
    expect(absorptionCeiling({ glucoseG: 60, fructoseG: 30 }, 105).ceilingG).toBe(105);
    // Training cannot defeat SGLT1 saturation on glucose alone.
    expect(absorptionCeiling({ glucoseG: 100, fructoseG: 0 }, 105).ceilingG).toBe(GLUCOSE_ONLY_CEILING_G_PER_H);
  });

  it("never promises past the trained maximum, however good the logs look", () => {
    expect(absorptionCeiling({ glucoseG: 60, fructoseG: 30 }, 400).ceilingG).toBe(110);
  });

  it("never drops below the population ceiling because of a modest log", () => {
    expect(absorptionCeiling({ glucoseG: 60, fructoseG: 30 }, 40).ceilingG).toBe(MULTI_TRANSPORTABLE_CEILING_G_PER_H);
  });

  it("says nothing rather than something wrong for an empty plan", () => {
    expect(absorptionCeiling({ glucoseG: 0, fructoseG: 0 }).ceilingG).toBe(0);
  });
});

describe("productCarbSources", () => {
  it("splits a declared 2:1 blend two-thirds/one-third", () => {
    const s = productCarbSources(product({ carbsG: 60, multiTransportable: true }), 1);
    expect(Math.round(s.glucoseG)).toBe(40);
    expect(Math.round(s.fructoseG)).toBe(20);
  });

  it("treats an undeclared product as glucose — the assumption that fails safe", () => {
    const s = productCarbSources(product({ carbsG: 30 }), 2);
    expect(s.glucoseG).toBe(60);
    expect(s.fructoseG).toBe(0);
  });

  it("adds up across the products actually being taken", () => {
    const mix = sumCarbSources([
      productCarbSources(product({ carbsG: 60, multiTransportable: true }), 1),
      productCarbSources(product({ carbsG: 25 }), 1),
    ]);
    expect(Math.round(mix.glucoseG)).toBe(65);
    expect(Math.round(mix.fructoseG)).toBe(20);
  });
});

describe("checkDeliverable", () => {
  it("catches the plan that asks 90 g/h from glucose gels", () => {
    const check = checkDeliverable(90, { glucoseG: 90, fructoseG: 0 });
    expect(check.deliverable).toBe(false);
    expect(check.shortfallG).toBe(30);
    expect(check.fix).toMatch(/fructose/i);
  });

  it("passes the same target when the mix supports it", () => {
    const check = checkDeliverable(90, { glucoseG: 60, fructoseG: 30 });
    expect(check.deliverable).toBe(true);
    expect(check.shortfallG).toBe(0);
    expect(check.fix).toBeUndefined();
  });

  it("tells an athlete already on a blend to stop adding, not to switch products", () => {
    const check = checkDeliverable(130, { glucoseG: 80, fructoseG: 40 });
    expect(check.deliverable).toBe(false);
    expect(check.fix).toMatch(/before and after/i);
  });
});

describe("carbBurnPerHourG", () => {
  it("scales with body mass — two athletes at the same effort do not burn the same", () => {
    expect(carbBurnPerHourG(90, "moderate")).toBeGreaterThan(carbBurnPerHourG(55, "moderate"));
  });

  it("rises with intensity, and lands in the physiological range", () => {
    const easy = carbBurnPerHourG(70, "easy");
    const race = carbBurnPerHourG(70, "race");
    expect(easy).toBeLessThan(race);
    // A 70 kg athlete at race effort oxidises on the order of 240 g/h of
    // carbohydrate; anything near 1000 would be nonsense.
    expect(race).toBeGreaterThan(150);
    expect(race).toBeLessThan(350);
  });

  it("follows the crossover: fat covers more of an easy effort", () => {
    expect(carbEnergyFraction("easy")).toBeLessThan(carbEnergyFraction("hard"));
    expect(carbEnergyFraction("race")).toBeLessThanOrEqual(1);
  });
});
