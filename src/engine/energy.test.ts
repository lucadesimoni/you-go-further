import { describe, expect, it } from "vitest";
import { energyProfile } from "./energy";
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
