import { describe, expect, it } from "vitest";
import { energyProfile, sustainableFraction } from "./energy";
import { buildSchedule } from "./schedule";
import { carbBurnPerHourG } from "./oxidation";
import { computeTarget } from "./recommend";
import type { AthleteInput } from "./types";

const base: AthleteInput = {
  goal: "endurance-performance",
  activity: "cycling",
  durationMin: 180,
  intensity: "hard",
  bodyWeightKg: 70,
};

const profileFor = (over: Partial<AthleteInput> = {}) => {
  const input = { ...base, ...over };
  return energyProfile(input, computeTarget(input));
};

describe("energyProfile", () => {
  it("scales the glycogen store with body weight", () => {
    expect(profileFor({ bodyWeightKg: 90 }).storeG).toBeGreaterThan(profileFor({ bodyWeightKg: 55 }).storeG);
  });

  it("burns more carbohydrate at higher intensity", () => {
    expect(profileFor({ intensity: "race" }).burnPerHourG).toBeGreaterThan(profileFor({ intensity: "easy" }).burnPerHourG);
  });

  it("mirrors the plan's carb intake", () => {
    const input = { ...base };
    const t = computeTarget(input);
    expect(energyProfile(input, t).intakePerHourG).toBe(t.carbPerHourG);
  });

  it("keeps the fuelled curve at or above the water-only curve everywhere", () => {
    for (const s of profileFor().samples) {
      expect(s.fuelledPct).toBeGreaterThanOrEqual(s.unfuelledPct - 0.001);
    }
    expect(profileFor().fuelledEndPct).toBeGreaterThanOrEqual(profileFor().unfuelledEndPct);
  });

  it("all samples stay within 0–100%", () => {
    for (const s of profileFor({ durationMin: 480, intensity: "race" }).samples) {
      expect(s.fuelledPct).toBeGreaterThanOrEqual(0);
      expect(s.fuelledPct).toBeLessThanOrEqual(100);
      expect(s.unfuelledPct).toBeGreaterThanOrEqual(0);
    }
  });

  it("flags a water-only fade on a long hard session", () => {
    const p = profileFor({ durationMin: 240, intensity: "race" });
    expect(p.unfuelledFadeMin).toBeDefined();
    expect(p.unfuelledFadeMin!).toBeLessThanOrEqual(240);
    expect(p.headline).toMatch(/fade line/i);
  });

  it("does not flag a fade for a short easy session", () => {
    const p = profileFor({ durationMin: 40, intensity: "easy" });
    expect(p.unfuelledFadeMin).toBeUndefined();
  });

  it("starts both curves full at minute 0", () => {
    const first = profileFor().samples[0];
    expect(first.minute).toBe(0);
    expect(first.fuelledPct).toBe(100);
    expect(first.unfuelledPct).toBe(100);
  });
});

describe("the model is not two straight lines", () => {
  /**
   * Burn was a constant and intake a constant subtracted from it, so both
   * curves were `store − rate × minutes`. The feed pins along the top of the
   * chart floated above a picture they could not affect: you could move every
   * gel and the curve would not move.
   */
  const session = (over: Partial<AthleteInput> = {}): AthleteInput => ({
    goal: "endurance-performance",
    activity: "trail-running",
    durationMin: 240,
    intensity: "moderate",
    bodyWeightKg: 70,
    conditions: "temperate",
    ...over,
  });
  const profileFor = (input: AthleteInput) => {
    const target = computeTarget(input);
    return energyProfile(input, target, buildSchedule(input));
  };
  const slopes = (p: ReturnType<typeof profileFor>, key: "fuelledPct" | "unfuelledPct") =>
    p.samples.slice(1).map((s, i) => Number((s[key] - p.samples[i][key]).toFixed(3)));

  it("bends the water-only curve as the tank empties", () => {
    // Carbohydrate oxidation falls as the athlete shifts to fat and slows —
    // which is what the wall looks like. A straight line says they keep burning
    // at full rate right through empty.
    const p = profileFor(session());
    expect(new Set(slopes(p, "unfuelledPct")).size).toBeGreaterThan(3);
  });

  it("makes each feed visible as a change in the curve", () => {
    const p = profileFor(session());
    const s = new Set(slopes(p, "fuelledPct"));
    expect(s.size, "the fuelled curve should step, not run straight").toBeGreaterThan(1);
    // And nothing arrives before the first feed has been swallowed and emptied
    // from the stomach.
    expect(p.samples[1].deliveredPerHourG).toBe(0);
    expect(Math.max(...p.samples.map((x) => x.deliveredPerHourG))).toBeGreaterThan(0);
  });

  it("moves the curve when the feeds move", () => {
    // The property that makes this a model rather than a decoration.
    const input = session();
    const target = computeTarget(input);
    const even = energyProfile(input, target, buildSchedule(input));
    const clustered = energyProfile(input, target, {
      ...buildSchedule(input),
      cues: [{ atMin: 10, kind: "carb", carbG: 250, label: "all of it at once", parts: [] }],
    });
    expect(clustered.samples.map((s) => s.fuelledPct)).not.toEqual(even.samples.map((s) => s.fuelledPct));
  });

  it("refuses to deliver more than the gut can move", () => {
    // A 105 g/h plan used to offset 105 g/h of burn. It does not: the surplus
    // stays in the stomach, and telling an athlete otherwise is the difference
    // between a plan and a wish.
    const p = profileFor(session({ durationMin: 600, intensity: "race", bodyWeightKg: 75 }));
    expect(p.intakePerHourG).toBeGreaterThan(p.absorbCeilingPerHourG);
    expect(p.deliveredTotalG).toBeLessThan(p.plannedTotalG);
    for (const s of p.samples) expect(s.deliveredPerHourG).toBeLessThanOrEqual(p.absorbCeilingPerHourG);
  });

  it("does not burn one-hour race pace for fourteen hours", () => {
    const short = profileFor(session({ durationMin: 45, intensity: "race" }));
    const long = profileFor(session({ durationMin: 830, intensity: "race" }));
    expect(long.burnPerHourG).toBeLessThan(short.burnPerHourG);
    expect(sustainableFraction(45)).toBe(1);
    expect(sustainableFraction(830)).toBeLessThan(0.85);
  });

  it("says so when even the plan cannot hold the tank up", () => {
    const p = profileFor(session({ durationMin: 830, intensity: "race", bodyWeightKg: 58 }));
    expect(p.fuelledFadeMin).toBeDefined();
    expect(p.headlineId).toBe("planNotEnough");
  });

  it("leaves a short easy session alone", () => {
    const p = profileFor(session({ durationMin: 45, intensity: "easy" }));
    expect(p.fuelledFadeMin).toBeUndefined();
    expect(p.unfuelledFadeMin).toBeUndefined();
    expect(p.fuelledEndPct).toBeGreaterThan(80);
  });

  it("never leaves the store outside 0–100 %", () => {
    for (const d of [30, 120, 400, 900]) {
      for (const s of profileFor(session({ durationMin: d })).samples) {
        expect(s.fuelledPct).toBeGreaterThanOrEqual(0);
        expect(s.fuelledPct).toBeLessThanOrEqual(100);
        expect(s.unfuelledPct).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it("uses the same burn model as the race simulation", () => {
    // Two tables for one number is how the chart and the forecast came to
    // disagree about the same athlete on the same session.
    const p = profileFor(session({ durationMin: 60, intensity: "hard", bodyWeightKg: 70 }));
    expect(p.burnPerHourG).toBe(carbBurnPerHourG(70, "hard"));
  });
});
