import { describe, expect, it } from "vitest";
import { buildCart } from "./cart";
import { recommend } from "../engine";
import type { AthleteInput } from "../engine";

const longRace: AthleteInput = {
  goal: "race-preparation",
  activity: "cycling",
  durationMin: 210,
  intensity: "hard",
  bodyWeightKg: 72,
  caffeineOk: true,
};

describe("buildCart", () => {
  it("builds priced lines from a recommendation", () => {
    const cart = buildCart(recommend(longRace));
    expect(cart.lines.length).toBeGreaterThan(0);
    expect(cart.subtotalChf).toBeGreaterThan(0);
    for (const l of cart.lines) {
      expect(l.qty).toBeGreaterThan(0);
      expect(l.unitPriceChf).toBeGreaterThan(0);
      expect(l.lineTotalChf).toBeCloseTo(l.unitPriceChf * l.qty, 2);
    }
  });

  it("orders enough drink-mix servings to cover the carb total", () => {
    const rec = recommend(longRace);
    const cart = buildCart(rec);
    const drink = cart.lines.find((l) => /Competition|Carbo|Ultra|Multi/i.test(l.name));
    expect(drink).toBeDefined();
    // carbTotal / serving carbs ≈ several servings for a 3.5 h race
    expect(drink!.qty).toBeGreaterThanOrEqual(3);
  });

  it("scales quantities and subtotal with the number of sessions", () => {
    const rec = recommend(longRace);
    const one = buildCart(rec, 1);
    const four = buildCart(rec, 4);
    expect(four.itemCount).toBe(one.itemCount * 4);
    expect(four.subtotalChf).toBeCloseTo(one.subtotalChf * 4, 2);
  });

  it("keeps the subtotal equal to the sum of line totals", () => {
    const cart = buildCart(recommend(longRace), 3);
    const sum = Math.round(cart.lines.reduce((s, l) => s + l.lineTotalChf, 0) * 100) / 100;
    expect(cart.subtotalChf).toBeCloseTo(sum, 2);
  });

  it("produces a small cart for a short easy session", () => {
    const cart = buildCart(recommend({ ...longRace, durationMin: 40, intensity: "easy" }));
    expect(cart.itemCount).toBeGreaterThan(0);
    expect(cart.subtotalChf).toBeLessThan(buildCart(recommend(longRace)).subtotalChf);
  });
});
