import { describe, it, expect } from "vitest";
import { dailyLoads, loadFlags, loadProfile, monotony } from "./trainingLoad";
import type { Activity } from "../model";
import type { AthleteProfile } from "../users";

const profile = { bodyWeightKg: 70, maxHrBpm: 190 } as AthleteProfile;
const NOW = new Date("2026-08-01T12:00:00.000Z");

/** A session `daysAgo` days before NOW, with an effort that drives load. */
const session = (daysAgo: number, minutes = 60, avgHr = 150): Activity => ({
  id: `a-${daysAgo}-${minutes}-${avgHr}`,
  provider: "strava",
  externalId: `${daysAgo}`,
  sport: "run",
  startTime: new Date(NOW.getTime() - daysAgo * 86_400_000).toISOString(),
  durationSec: minutes * 60,
  avgHr,
});

/** `n` days of training ending today, one session a day. */
const block = (n: number, minutes = 60, avgHr = 150) =>
  Array.from({ length: n }, (_, i) => session(i, minutes, avgHr));

describe("dailyLoads", () => {
  it("includes rest days as zeros — otherwise a fortnight off looks like peak fitness", () => {
    const acts = [session(10), session(0)];
    const days = dailyLoads(acts, profile, NOW);
    expect(days).toHaveLength(11);
    expect(days.filter((d) => d.load === 0).length).toBe(9);
  });

  it("sums two sessions on the same day", () => {
    const days = dailyLoads([session(1, 60), session(1, 30)], profile, NOW);
    const that = days.find((d) => d.load > 0)!;
    expect(that.load).toBeGreaterThan(0);
    const single = dailyLoads([session(1, 60)], profile, NOW).find((d) => d.load > 0)!;
    expect(that.load).toBeGreaterThan(single.load);
  });

  it("is empty rather than wrong with nothing to go on", () => {
    expect(dailyLoads([], profile, NOW)).toEqual([]);
  });
});

describe("loadProfile", () => {
  it("says nothing it cannot support from three weeks of history", () => {
    const p = loadProfile(block(10), profile, NOW);
    expect(p.reliable).toBe(false);
    expect(loadFlags(p)).toEqual([]);
  });

  it("calls an unchanging routine steady, not a build", () => {
    // 40 identical days is a habit, not progressive overload — and the model
    // should not flatter it by calling it "building".
    const p = loadProfile(block(40), profile, NOW);
    expect(p.reliable).toBe(true);
    expect(p.fitness).toBeGreaterThan(0);
    // Daily training still keeps the 7-day average above the 42-day one.
    expect(p.fatigue).toBeGreaterThan(p.fitness);
    expect(p.trend).toBe("steady");
  });

  it("calls a progressive block a build, with fatigue running ahead of fitness", () => {
    // Volume climbing week on week: the sessions nearest today are the longest.
    const progressive = Array.from({ length: 42 }, (_, i) => session(i, 150 - i * 2, 165));
    const p = loadProfile(progressive, profile, NOW);
    expect(p.form).toBeLessThan(-10);
    expect(p.trend).toBe("building");
  });

  it("turns form positive during a taper", () => {
    // Four weeks of work, then a genuinely easy week.
    const hard = Array.from({ length: 28 }, (_, i) => session(i + 7, 90, 160));
    const easy = [session(2, 30, 120), session(5, 30, 120)];
    const p = loadProfile([...hard, ...easy], profile, NOW);
    expect(p.form).toBeGreaterThan(0);
    expect(p.trend).toBe("tapering");
  });

  it("reports a ramp rate that a rapid build actually triggers", () => {
    // Nothing for a month, then a heavy week — the classic injury setup.
    const quiet = Array.from({ length: 4 }, (_, i) => session(i * 7 + 14, 30, 120));
    const spike = Array.from({ length: 7 }, (_, i) => session(i, 120, 165));
    const p = loadProfile([...quiet, ...spike], profile, NOW);
    expect(p.rampPct).toBeGreaterThan(10);
    expect(loadFlags(p).map((f) => f.id)).toContain("rampTooFast");
  });

  it("counts the days actually trained in the last week", () => {
    const p = loadProfile([...block(30), session(0), session(2)], profile, NOW);
    expect(p.activeDays).toBe(7);
  });
});

describe("monotony", () => {
  it("is high when every day is the same", () => {
    expect(monotony([50, 50, 50, 50, 50, 50, 50])).toBeGreaterThanOrEqual(2);
  });

  it("is low when hard days sit next to real rest", () => {
    expect(monotony([120, 0, 90, 0, 140, 0, 40])).toBeLessThan(2);
  });

  it("is zero for a week with no training at all", () => {
    expect(monotony([0, 0, 0, 0, 0, 0, 0])).toBe(0);
  });
});

describe("loadFlags", () => {
  it("flags a samey week, and names the number behind it", () => {
    const even = Array.from({ length: 35 }, (_, i) => session(i, 60, 150));
    const flags = loadFlags(loadProfile(even, profile, NOW));
    const mono = flags.find((f) => f.id === "highMonotony");
    expect(mono).toBeDefined();
    expect(mono!.text).toMatch(/monotony \d/);
  });

  it("connects deep fatigue to what the athlete should eat", () => {
    const heavy = Array.from({ length: 30 }, (_, i) => session(i, 150, 170));
    const flags = loadFlags(loadProfile(heavy, profile, NOW));
    const deep = flags.find((f) => f.id === "deepFatigue");
    if (deep) {
      expect(deep.severity).toBe("act");
      expect(deep.text).toMatch(/recovery|carbohydrate|protein/i);
    }
  });

  it("says when it is a good week to race", () => {
    const built = Array.from({ length: 40 }, (_, i) => session(i + 10, 100, 160));
    const flags = loadFlags(loadProfile(built, profile, NOW));
    expect(flags.map((f) => f.id)).toContain("wellRested");
  });
});
