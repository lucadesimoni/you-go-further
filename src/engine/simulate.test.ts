import { describe, it, expect } from "vitest";
import { simulateRace, FADE_PCT, type SimInput } from "./simulate";
import { heatIndexC, heatStrain } from "./heatStrain";
import { planRouteFuelling } from "./routeFuelling";
import type { ElevationSample } from "../geo/swisstopo";

const profile = (pts: [number, number][]): ElevationSample[] =>
  pts.map(([km, altM]) => ({ distanceM: km * 1000, altM }));

/** A 42 km mountain marathon: 1800 m up, then back down. */
const MOUNTAIN = profile([
  [0, 570],
  [10, 900],
  [20, 1600],
  [25, 2100],
  [32, 1400],
  [42, 600],
]);

const plan = (durationMin: number, carbPerHourG: number) =>
  planRouteFuelling({ samples: MOUNTAIN, activity: "trail-running", durationMin, carbPerHourG });

const sim = (over: Partial<SimInput> = {}) =>
  simulateRace({
    plan: plan(300, 70),
    bodyWeightKg: 70,
    intensity: "moderate",
    fluidPerHourMl: 600,
    sodiumPerLitreMg: 500,
    temperatureC: 18,
    humidityPct: 50,
    ...over,
  });

describe("simulateRace", () => {
  it("walks the whole course and never leaves the tank outside 0–100%", () => {
    const s = sim();
    // One point per profile segment, and the last one reads the finish time.
    expect(s.points).toHaveLength(MOUNTAIN.length - 1);
    expect(s.points[s.points.length - 1].atMin).toBe(300);
    for (const p of s.points) {
      expect(p.fuelledPct).toBeGreaterThanOrEqual(0);
      expect(p.fuelledPct).toBeLessThanOrEqual(100);
      expect(p.unfuelledPct).toBeGreaterThanOrEqual(0);
    }
  });

  it("keeps the fuelled curve at or above the water-only curve, everywhere", () => {
    for (const p of sim().points) expect(p.fuelledPct).toBeGreaterThanOrEqual(p.unfuelledPct - 0.001);
  });

  it("empties the tank on water alone over a five-hour mountain race", () => {
    const s = sim();
    expect(s.bonkKmUnfuelled).toBeDefined();
    expect(s.bonkKmUnfuelled!).toBeGreaterThan(0);
    expect(s.bonkKmUnfuelled!).toBeLessThan(42);
  });

  it("names the kilometre, which is the thing a watch never tells you", () => {
    const s = sim();
    const averted = s.warnings.find((w) => w.id === "bonkAverted" || w.id === "bonk");
    expect(averted).toBeDefined();
    expect(averted!.atKm).toBeGreaterThan(0);
    expect(averted!.text).toMatch(/km \d/);
  });

  it("drains faster in the heat than in the cold, on the identical course", () => {
    const cool = sim({ temperatureC: 8, humidityPct: 50 });
    const hot = sim({ temperatureC: 33, humidityPct: 80 });
    expect(hot.burnTotalG).toBeGreaterThan(cool.burnTotalG);
    expect(hot.sweatTotalMl).toBeGreaterThan(cool.sweatTotalMl);
    expect(hot.finishFuelledPct).toBeLessThan(cool.finishFuelledPct);
  });

  it("warns about fluid when the drinking plan cannot keep up with the sweating", () => {
    const s = sim({ temperatureC: 33, humidityPct: 80, fluidPerHourMl: 300 });
    const dehydration = s.warnings.find((w) => w.id === "dehydration");
    expect(dehydration).toBeDefined();
    expect(s.peakFluidDeficitPct).toBeGreaterThan(2);
  });

  it("does not cry dehydration when the athlete is drinking enough", () => {
    const s = sim({ temperatureC: 12, humidityPct: 50, fluidPerHourMl: 900 });
    expect(s.warnings.find((w) => w.id === "dehydration")).toBeUndefined();
  });

  it("flags a sodium gap only when the loss is big enough to matter", () => {
    const long = simulateRace({
      plan: plan(420, 70),
      bodyWeightKg: 75,
      intensity: "moderate",
      fluidPerHourMl: 500,
      sodiumPerLitreMg: 200,
      temperatureC: 30,
      humidityPct: 70,
    });
    expect(long.warnings.map((w) => w.id)).toContain("sodium");

    // A five-hour race on a 500 mg/L drink *does* under-replace sodium even in
    // the cold — that warning is correct, so the negative case has to be a
    // genuinely short session with a properly salty drink.
    const short = simulateRace({
      plan: plan(90, 60),
      bodyWeightKg: 70,
      intensity: "moderate",
      fluidPerHourMl: 700,
      sodiumPerLitreMg: 1000,
      temperatureC: 12,
      humidityPct: 45,
    });
    expect(short.warnings.map((w) => w.id)).not.toContain("sodium");
  });

  it("says plainly when the plan covers the course", () => {
    const s = sim({ temperatureC: 10, humidityPct: 45 });
    if (s.bonkKmFuelled === undefined) {
      expect(s.finishFuelledPct).toBeGreaterThan(FADE_PCT);
      expect(s.headline).toMatch(/km \d|reserve/);
    }
  });

  it("reports what was taken against what the course demanded", () => {
    const s = sim();
    expect(s.burnTotalG).toBeGreaterThan(0);
    expect(s.intakeTotalG).toBeGreaterThan(0);
    // The plan is a top-up, never a replacement for the store.
    expect(s.intakeTotalG).toBeLessThan(s.burnTotalG);
  });

  it("carries every number it prints, so a translation never has to parse the sentence", () => {
    const s = sim({ temperatureC: 33, humidityPct: 80, fluidPerHourMl: 300 });
    for (const w of s.warnings) {
      // Every number in the English sentence has to exist in `values`, or a
      // German reader gets a sentence with a hole in it.
      const printed = (w.text.match(/\d+(\.\d+)?/g) ?? []).map(Number);
      const carried = Object.values(w.values);
      for (const n of printed) {
        expect(carried.some((v) => Math.abs(v - n) < 0.05 || w.atKm === n)).toBe(true);
      }
    }
  });

  it("names the outcome as an id, not only as English prose", () => {
    expect(sim({ temperatureC: 10, humidityPct: 45 }).verdict).toBe("averted");
    const covered = simulateRace({
      plan: plan(45, 60),
      bodyWeightKg: 70,
      intensity: "easy",
      fluidPerHourMl: 600,
      sodiumPerLitreMg: 500,
      temperatureC: 12,
      humidityPct: 50,
    });
    expect(covered.verdict).toBe("covered");
    expect(covered.bonkKmUnfuelled).toBeUndefined();
  });

  it("reports the conditions it modelled, so the card can show them", () => {
    const s = sim({ temperatureC: 33, humidityPct: 80 });
    expect(s.feelsLikeC).toBeGreaterThan(33);
    expect(s.heatRisk).toBe("extreme");
    expect(sim({ temperatureC: 8, humidityPct: 50 }).heatRisk).toBe("low");
  });

  it("survives a route with no fuelling stops at all", () => {
    const s = simulateRace({
      plan: planRouteFuelling({ samples: MOUNTAIN, activity: "running", durationMin: 40, carbPerHourG: 0 }),
      bodyWeightKg: 70,
      intensity: "easy",
      fluidPerHourMl: 500,
      sodiumPerLitreMg: 400,
      temperatureC: 15,
      humidityPct: 50,
    });
    expect(s.intakeTotalG).toBe(0);
    expect(s.headline.length).toBeGreaterThan(0);
  });
});

describe("heatIndexC", () => {
  it("leaves cool temperatures alone — humidity barely matters there", () => {
    expect(heatIndexC(12, 90)).toBe(12);
  });

  it("makes a humid 32 °C feel far hotter than a dry one", () => {
    const dry = heatIndexC(32, 25);
    const humid = heatIndexC(32, 85);
    expect(humid).toBeGreaterThan(dry + 5);
  });

  it("matches the published heat index: 32 °C at 70 % feels like about 41 °C", () => {
    expect(heatIndexC(32, 70)).toBeGreaterThan(38);
    expect(heatIndexC(32, 70)).toBeLessThan(44);
  });
});

describe("heatStrain", () => {
  const base = { bodyWeightKg: 70, intensity: "moderate" as const, temperatureC: 18, humidityPct: 50 };

  it("sweats more in the heat, and more again when it is humid", () => {
    const mild = heatStrain(base);
    const hot = heatStrain({ ...base, temperatureC: 32 });
    const hotHumid = heatStrain({ ...base, temperatureC: 32, humidityPct: 85 });
    expect(hot.sweatRateMlPerH).toBeGreaterThan(mild.sweatRateMlPerH);
    expect(hotHumid.sweatRateMlPerH).toBeGreaterThan(hot.sweatRateMlPerH);
  });

  it("scales with body mass and with effort", () => {
    expect(heatStrain({ ...base, bodyWeightKg: 95 }).sweatRateMlPerH).toBeGreaterThan(
      heatStrain({ ...base, bodyWeightKg: 55 }).sweatRateMlPerH,
    );
    expect(heatStrain({ ...base, intensity: "race" }).sweatRateMlPerH).toBeGreaterThan(
      heatStrain({ ...base, intensity: "easy" }).sweatRateMlPerH,
    );
  });

  it("lets a measurement override the model, and says that it did", () => {
    const s = heatStrain({ ...base, measuredSweatRateMlPerH: 1400 });
    expect(s.sweatRateMlPerH).toBe(1400);
    expect(s.measured).toBe(true);
    expect(heatStrain(base).measured).toBe(false);
  });

  it("uses a measured sweat sodium rather than the population placeholder", () => {
    const salty = heatStrain({ ...base, measuredSweatSodiumMgPerL: 1600 });
    expect(salty.sweatSodiumMgPerL).toBe(1600);
    expect(salty.sodiumLossMgPerH).toBeGreaterThan(heatStrain(base).sodiumLossMgPerH);
  });

  it("raises carbohydrate burn in the heat, but only within a defensible range", () => {
    expect(heatStrain({ ...base, temperatureC: 10 }).carbBurnMultiplier).toBe(1);
    const hot = heatStrain({ ...base, temperatureC: 35, humidityPct: 70 }).carbBurnMultiplier;
    expect(hot).toBeGreaterThan(1.1);
    expect(hot).toBeLessThanOrEqual(1.25);
  });

  it("escalates its risk label with the apparent temperature", () => {
    expect(heatStrain({ ...base, temperatureC: 10 }).risk).toBe("low");
    expect(heatStrain({ ...base, temperatureC: 28, humidityPct: 40 }).risk).toBe("moderate");
    expect(heatStrain({ ...base, temperatureC: 34, humidityPct: 60 }).risk).toBe("extreme");
  });

  it("gives advice that names the actual numbers", () => {
    const s = heatStrain({ ...base, temperatureC: 33, humidityPct: 75 });
    expect(s.advice).toMatch(/\d+/);
  });
});
