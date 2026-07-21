import { describe, expect, it } from "vitest";
import { computeTarget } from "./recommend";
import { idealOffering, productUsage, scoreForSlot } from "./offering";
import { CATALOG } from "./catalog";
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

const offeringFor = (over: Partial<AthleteInput> = {}) => {
  const input = { ...base, ...over };
  return idealOffering(input, computeTarget(input));
};
const pick = (o: ReturnType<typeof idealOffering>, slot: string) => o.slots.find((s) => s.slot === slot);

describe("idealOffering — when to use what", () => {
  it("picks a drink mix as the primary carb carrier for a fueled session", () => {
    const carrier = pick(offeringFor(), "carb-carrier");
    expect(carrier?.needed).toBe(true);
    expect(carrier?.pick?.product.category).toBe("drink-mix");
    expect(carrier?.pick?.reasons.length).toBeGreaterThan(0);
  });

  it("does not need carbs for a short easy session, offers hydration instead", () => {
    const o = offeringFor({ durationMin: 40, intensity: "easy" });
    expect(pick(o, "carb-carrier")?.needed).toBe(false);
    const hydration = pick(o, "hydration");
    expect(hydration?.needed).toBe(true);
    expect(hydration?.pick?.product.carbsG).toBeLessThanOrEqual(1);
  });

  it("only surfaces caffeine when the athlete opts in", () => {
    const withCaf = offeringFor({ durationMin: 180, intensity: "race", caffeineOk: true });
    const withoutCaf = offeringFor({ durationMin: 180, intensity: "race", caffeineOk: false });
    const hasCaf = (o: ReturnType<typeof idealOffering>) =>
      o.slots.some((s) => (s.pick?.product.caffeineMg ?? 0) > 0);
    expect(hasCaf(withCaf)).toBe(true);
    expect(hasCaf(withoutCaf)).toBe(false);
  });

  it("requires multi-transportable carbs for a high-carb race", () => {
    const o = offeringFor({ durationMin: 240, intensity: "race", goal: "race-preparation" });
    const carrier = pick(o, "carb-carrier")?.pick?.product;
    expect(carrier?.multiTransportable).toBe(true);
    const topup = pick(o, "carb-topup")?.pick?.product;
    expect(topup?.multiTransportable).toBe(true);
  });

  it("needs a standalone electrolyte only for heat / heavy sweaters", () => {
    expect(pick(offeringFor(), "electrolyte")?.needed).toBe(false);
    expect(pick(offeringFor({ conditions: "hot", sweatLevel: "heavy" }), "electrolyte")?.needed).toBe(true);
  });

  it("prefers a protein-forward recovery on a weight-loss goal", () => {
    const loss = pick(offeringFor({ goal: "weight-loss", durationMin: 90, intensity: "hard" }), "recovery")?.pick?.product;
    expect((loss?.proteinG ?? 0)).toBeGreaterThanOrEqual(15);
  });

  it("scores are bounded 0–100 and every eligible pick has reasons", () => {
    for (const s of offeringFor().slots) {
      if (!s.pick) continue;
      expect(s.pick.score).toBeGreaterThanOrEqual(0);
      expect(s.pick.score).toBeLessThanOrEqual(100);
      expect(s.pick.reasons.length).toBeGreaterThan(0);
    }
  });

  it("excludes a caffeinated product from a slot when not opted in", () => {
    const caf = CATALOG.find((p) => (p.caffeineMg ?? 0) > 0)!;
    const target = computeTarget({ ...base, durationMin: 180, intensity: "race" });
    const noOptIn = scoreForSlot(caf, "carb-topup", { ...base, durationMin: 180, intensity: "race", caffeineOk: false }, target);
    expect(noOptIn).toBeNull();
  });
});

describe("productUsage — session-independent guide", () => {
  it("describes when to use a high-carb drink mix", () => {
    const loader = CATALOG.find((p) => p.category === "drink-mix" && p.carbsG >= 55)!;
    const g = productUsage(loader);
    expect(g.summary).toMatch(/carrier|loader/i);
    expect(g.bestWhen.length).toBeGreaterThan(0);
    expect(g.avoidWhen.length).toBeGreaterThan(0);
  });

  it("flags caffeinated gels for the back half and to avoid on easy days", () => {
    const cafGel = CATALOG.find((p) => p.category === "gel" && (p.caffeineMg ?? 0) > 0)!;
    const g = productUsage(cafGel);
    expect(g.bestWhen.join(" ")).toMatch(/caffeine|final third/i);
    expect(g.avoidWhen.join(" ")).toMatch(/caffeine|easy/i);
  });

  it("marks calorie-free electrolytes as good for weight-loss / easy sessions", () => {
    const tab = CATALOG.find((p) => p.category === "electrolyte" && p.carbsG <= 1)!;
    const g = productUsage(tab);
    expect(g.bestWhen.join(" ")).toMatch(/no sugar|weight-loss|easy/i);
  });
});
