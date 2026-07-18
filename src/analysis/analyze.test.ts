import { describe, expect, it } from "vitest";
import type { Activity, AthleteProfile, Wellness } from "../model";
import {
  acwr,
  analyze,
  derivePhysiology,
  estimateSweatRateMlPerH,
  inferIntensity,
  nutritionDemand,
  sessionLoad,
  weeklyBuckets,
} from "./analyze";

const profile: AthleteProfile = { bodyWeightKg: 68, maxHr: 190 };
const now = new Date("2026-07-18T12:00:00Z");

function act(partial: Partial<Activity> & { id: string; startTime: string }): Activity {
  return {
    provider: "garmin",
    externalId: partial.id,
    sport: "run",
    durationSec: 60 * 60,
    ...partial,
  } as Activity;
}

describe("inferIntensity", () => {
  it("maps HR fraction to intensity bands", () => {
    expect(inferIntensity(act({ id: "1", startTime: now.toISOString(), avgHr: 120 }), 190)).toBe("easy");
    expect(inferIntensity(act({ id: "2", startTime: now.toISOString(), avgHr: 143 }), 190)).toBe("moderate");
    expect(inferIntensity(act({ id: "3", startTime: now.toISOString(), avgHr: 158 }), 190)).toBe("hard");
    expect(inferIntensity(act({ id: "4", startTime: now.toISOString(), avgHr: 172 }), 190)).toBe("race");
  });
});

describe("sessionLoad", () => {
  it("prefers a provider-supplied training load", () => {
    const a = act({ id: "x", startTime: now.toISOString(), trainingLoad: 123 });
    expect(sessionLoad(a, profile)).toBe(123);
  });

  it("falls back to an HR/duration proxy when absent", () => {
    const a = act({ id: "y", startTime: now.toISOString(), durationSec: 3600, avgHr: 150, maxHr: 190 });
    const load = sessionLoad(a, profile);
    expect(load).toBeGreaterThan(0);
    expect(load).toBeLessThanOrEqual(66); // 60 min * <=1.1
  });
});

describe("weeklyBuckets", () => {
  it("groups sessions by ISO week and sums load/volume", () => {
    const activities = [
      act({ id: "a", startTime: "2026-07-06T08:00:00Z", trainingLoad: 50, distanceM: 10000 }),
      act({ id: "b", startTime: "2026-07-08T08:00:00Z", trainingLoad: 60, distanceM: 12000 }),
      act({ id: "c", startTime: "2026-07-13T08:00:00Z", trainingLoad: 40, distanceM: 8000 }),
    ];
    const weeks = weeklyBuckets(activities, profile);
    expect(weeks).toHaveLength(2);
    expect(weeks[0].weekStart <= weeks[1].weekStart).toBe(true);
    expect(weeks[0].sessions).toBe(2);
    expect(weeks[0].load).toBe(110);
    expect(weeks[0].distanceKm).toBe(22);
  });
});

describe("acwr", () => {
  it("flags a load spike as caution/high-risk", () => {
    const activities: Activity[] = [];
    // Steady chronic load 3 weeks back, then a big acute week.
    for (let d = 8; d <= 28; d += 2) {
      activities.push(act({ id: `c${d}`, startTime: new Date(now.getTime() - d * 86400000).toISOString(), trainingLoad: 40 }));
    }
    for (let d = 0; d < 7; d++) {
      activities.push(act({ id: `a${d}`, startTime: new Date(now.getTime() - d * 86400000).toISOString(), trainingLoad: 120 }));
    }
    const r = acwr(activities, profile, now);
    expect(r.ratio).toBeGreaterThan(1.3);
    expect(["caution", "high-risk"]).toContain(r.status);
  });

  it("returns optimal with no history", () => {
    expect(acwr([], profile, now).status).toBe("optimal");
  });
});

describe("nutritionDemand", () => {
  it("aggregates weekly during-carbohydrate across sessions", () => {
    const activities = [
      act({ id: "long", startTime: new Date(now.getTime() - 2 * 86400000).toISOString(), durationSec: 180 * 60, avgHr: 150, maxHr: 190 }),
      act({ id: "easy", startTime: new Date(now.getTime() - 1 * 86400000).toISOString(), durationSec: 40 * 60, avgHr: 120, maxHr: 190 }),
    ];
    const d = nutritionDemand(activities, profile, "endurance-performance", now);
    expect(d.totalSessions).toBe(2);
    expect(d.fueledSessions).toBeGreaterThanOrEqual(1);
    expect(d.weeklyDuringCarbG).toBeGreaterThan(0);
    expect(d.avgCarbPerHourG).toBeGreaterThan(0);
  });
});

describe("derivePhysiology", () => {
  const w = (date: string, over: Partial<Wellness> = {}): Wellness => ({ provider: "garmin", date, ...over });

  it("returns no signals for empty wellness", () => {
    expect(derivePhysiology([], now).hasSignals).toBe(false);
  });

  it("takes the latest readiness/HRV and a rolling HRV baseline", () => {
    const wellness = [
      w("2026-07-01", { hrvMs: 60, readiness: 55, restingHr: 48 }),
      w("2026-07-17", { hrvMs: 50, readiness: 40, restingHr: 50 }),
      w("2026-07-18", { hrvMs: 46, readiness: 35, restingHr: 51 }),
    ];
    const snap = derivePhysiology(wellness, now);
    expect(snap.hasSignals).toBe(true);
    expect(snap.readiness).toBe(35); // latest
    expect(snap.hrvMs).toBe(46); // latest
    expect(snap.hrvBaselineMs).toBe(52); // mean(60,50,46)
    expect(snap.restingHr).toBe(51);
  });
});

describe("estimateSweatRateMlPerH", () => {
  it("scales with body mass, intensity, and heat", () => {
    const moderate = estimateSweatRateMlPerH(70, "moderate", "temperate");
    const raceHot = estimateSweatRateMlPerH(70, "race", "hot");
    const lightCool = estimateSweatRateMlPerH(70, "easy", "cool");
    expect(raceHot).toBeGreaterThan(moderate);
    expect(moderate).toBeGreaterThan(lightCool);
    expect(moderate).toBe(700); // 70 * 10 * 1.0
  });
});

describe("analyze", () => {
  it("produces a complete report", () => {
    const activities = [
      act({ id: "a", startTime: new Date(now.getTime() - 1 * 86400000).toISOString(), durationSec: 60 * 60, distanceM: 12000, avgHr: 150, maxHr: 190 }),
      act({ id: "b", startTime: new Date(now.getTime() - 5 * 86400000).toISOString(), durationSec: 90 * 60, distanceM: 18000, avgHr: 145, maxHr: 190 }),
    ];
    const report = analyze(activities, profile, "race-preparation", now);
    expect(report.totalActivities).toBe(2);
    expect(report.totalHours).toBeCloseTo(2.5, 1);
    expect(report.totalDistanceKm).toBe(30);
    expect(report.weeks.length).toBeGreaterThan(0);
    expect(report.acwr).toHaveProperty("ratio");
    expect(report.nutrition.totalSessions).toBe(2);
  });
});
