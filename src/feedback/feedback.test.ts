import { describe, expect, it } from "vitest";
import { deriveAdaptation, type SessionFeedback } from "./feedback";
import { recommend } from "../engine";
import type { AthleteInput } from "../engine";

let seq = 0;
function fb(over: Partial<SessionFeedback>): SessionFeedback {
  seq += 1;
  return {
    id: `f${seq}`,
    date: `2026-07-${String(seq).padStart(2, "0")}T08:00:00Z`,
    durationMin: 120,
    plannedCarbPerHourG: 60,
    gi: "none",
    energy: "steady",
    ...over,
  };
}

describe("deriveAdaptation", () => {
  it("returns a neutral, no-confidence result with no logs", () => {
    const a = deriveAdaptation([]);
    expect(a.confidence).toBe("none");
    expect(a.carbBiasG).toBe(0);
    expect(a.carbCeilingG).toBeUndefined();
  });

  it("lowers the ceiling below the rate that caused GI distress", () => {
    const a = deriveAdaptation([
      fb({ gi: "severe", plannedCarbPerHourG: 90 }),
      fb({ gi: "severe", actualCarbPerHourG: 80 }),
      fb({ gi: "none", plannedCarbPerHourG: 60 }),
    ]);
    expect(a.carbCeilingG).toBeDefined();
    expect(a.carbCeilingG!).toBeLessThan(80);
  });

  it("nudges carbs up after repeated low-energy sessions with a settled gut", () => {
    const a = deriveAdaptation([
      fb({ gi: "none", energy: "bonked", plannedCarbPerHourG: 40 }),
      fb({ gi: "none", energy: "faded", plannedCarbPerHourG: 45 }),
      fb({ gi: "none", energy: "steady" }),
    ]);
    expect(a.carbBiasG).toBeGreaterThan(0);
    expect(a.carbCeilingG).toBeUndefined();
  });

  it("scales confidence with the number of logs", () => {
    expect(deriveAdaptation([fb({})]).confidence).toBe("low");
    expect(deriveAdaptation([fb({}), fb({}), fb({})]).confidence).toBe("medium");
    expect(deriveAdaptation([fb({}), fb({}), fb({}), fb({}), fb({})]).confidence).toBe("high");
  });
});

describe("adaptation applied in recommend", () => {
  const base: AthleteInput = {
    goal: "race-preparation",
    activity: "cycling",
    durationMin: 210,
    intensity: "race",
    bodyWeightKg: 70,
  };

  it("caps the carb target at the learned ceiling and explains why", () => {
    const uncapped = recommend(base).target.carbPerHourG;
    const capped = recommend({ ...base, adaptation: { carbCeilingG: 55 } });
    expect(capped.target.carbPerHourG).toBeLessThanOrEqual(55);
    expect(capped.target.carbPerHourG).toBeLessThan(uncapped);
    expect(capped.notes.some((n) => /capped at .* learned from the gut-distress/i.test(n))).toBe(true);
  });

  it("raises the target with a positive bias", () => {
    const normal = recommend({ ...base, durationMin: 90, intensity: "moderate" }).target.carbPerHourG;
    const boosted = recommend({ ...base, durationMin: 90, intensity: "moderate", adaptation: { carbBiasG: 10 } }).target.carbPerHourG;
    expect(boosted).toBeGreaterThan(normal);
  });
});
