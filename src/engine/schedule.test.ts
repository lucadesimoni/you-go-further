import { describe, expect, it } from "vitest";
import { buildSchedule, formatClock } from "./schedule";
import { computeTarget } from "./recommend";
import type { AthleteInput } from "./types";

const base: AthleteInput = {
  goal: "endurance-performance",
  activity: "cycling",
  durationMin: 120,
  intensity: "moderate",
  bodyWeightKg: 70,
};

describe("formatClock", () => {
  it("formats minutes as H:MM", () => {
    expect(formatClock(20)).toBe("0:20");
    expect(formatClock(75)).toBe("1:15");
    expect(formatClock(120)).toBe("2:00");
  });
});

describe("buildSchedule", () => {
  it("always brackets the session with a start and a finish cue", () => {
    const s = buildSchedule(base);
    expect(s.cues[0].kind).toBe("start");
    expect(s.cues[0].atMin).toBe(0);
    const last = s.cues[s.cues.length - 1];
    expect(last.kind).toBe("finish");
    expect(last.atMin).toBe(base.durationMin);
  });

  it("keeps every cue within the session window and time-ordered", () => {
    const s = buildSchedule(base);
    let prev = -1;
    for (const c of s.cues) {
      expect(c.atMin).toBeGreaterThanOrEqual(0);
      expect(c.atMin).toBeLessThanOrEqual(base.durationMin);
      expect(c.atMin).toBeGreaterThanOrEqual(prev);
      prev = c.atMin;
    }
  });

  it("emits carb cues whose total is close to the per-hour target", () => {
    const s = buildSchedule(base, { carbIntervalMin: 20 });
    expect(s.totalCarbG).toBeGreaterThan(0);
    // ~5 carb hits over ~2 h at ~45 g/h ≈ within a reasonable band
    expect(s.totalCarbG).toBeGreaterThanOrEqual(60);
    expect(s.totalCarbG).toBeLessThanOrEqual(120);
  });

  it("gives a hydration-only schedule for a short easy session", () => {
    const s = buildSchedule({ ...base, durationMin: 40, intensity: "easy" });
    expect(s.totalCarbG).toBe(0);
    expect(s.cues.some((c) => c.kind === "carb")).toBe(false);
    expect(s.cues.some((c) => c.fluidMl && c.fluidMl > 0)).toBe(true);
  });

  it("schedules caffeine in the back half only when opted in", () => {
    const withCaf = buildSchedule({ ...base, durationMin: 180, intensity: "hard", caffeineOk: true });
    const withoutCaf = buildSchedule({ ...base, durationMin: 180, intensity: "hard", caffeineOk: false });
    const cafCue = withCaf.cues.find((c) => c.caffeine);
    expect(cafCue).toBeDefined();
    expect(cafCue!.atMin).toBeGreaterThan(180 / 2);
    expect(withoutCaf.cues.some((c) => c.caffeine)).toBe(false);
  });

  it("respects a custom carb interval", () => {
    const dense = buildSchedule(base, { carbIntervalMin: 15 });
    const sparse = buildSchedule(base, { carbIntervalMin: 30 });
    const carbCues = (s: ReturnType<typeof buildSchedule>) => s.cues.filter((c) => c.kind === "carb").length;
    expect(carbCues(dense)).toBeGreaterThan(carbCues(sparse));
  });
});

describe("the plan is not an even drip", () => {
  const input: AthleteInput = {
    goal: "endurance-performance",
    activity: "trail-running",
    durationMin: 240,
    intensity: "moderate",
    bodyWeightKg: 70,
    conditions: "temperate",
  };

  it("stops feeding early enough for the last gel to be used", () => {
    // It takes about a quarter of an hour to reach the blood, so a feed at
    // minute 235 of a four-hour run is swallowed, carried, and finished with.
    const s = buildSchedule(input);
    const carbs = s.cues.filter((c) => c.carbG);
    expect(carbs[carbs.length - 1].atMin).toBeLessThanOrEqual(240 - 15);
  });

  it("redistributes those grams rather than dropping them", () => {
    const s = buildSchedule(input);
    const target = computeTarget(input);
    expect(Math.abs(s.totalCarbG - target.carbTotalG)).toBeLessThanOrEqual(10);
  });

  it("leans the doses forward, because early grams are worth more", () => {
    const carbs = buildSchedule(input).cues.filter((c) => c.carbG);
    expect(carbs[0].carbG ?? 0).toBeGreaterThan(carbs[carbs.length - 1].carbG ?? 0);
  });

  it("does not lean so far that the first hour is a feast", () => {
    const carbs = buildSchedule(input).cues.filter((c) => c.carbG);
    expect((carbs[0].carbG ?? 0) / (carbs[carbs.length - 1].carbG ?? 1)).toBeLessThan(1.6);
  });

  it("hands out nothing at all when no feed could land in time", () => {
    // A 25-minute session runs on its own stores; a gel for the bin is worse
    // than saying so.
    const short = buildSchedule({ ...input, durationMin: 25, intensity: "race" });
    expect(short.cues.filter((c) => c.carbG)).toHaveLength(0);
  });
});
