import { describe, expect, it } from "vitest";
import { computeProgress } from "./progress";
import type { Activity } from "../model";

const act = (over: Partial<Activity> = {}): Activity => ({
  id: `a${Math.random()}`,
  provider: "strava",
  externalId: "x",
  sport: "run",
  startTime: "2024-06-01T06:00:00.000Z",
  durationSec: 3600,
  ...over,
});

const days = (n: number) =>
  Array.from({ length: n }, (_, i) =>
    act({ startTime: new Date(Date.UTC(2024, 5, 1 + i, 6)).toISOString() }),
  );

describe("computeProgress", () => {
  it("starts with nothing done and no invented numbers", () => {
    const p = computeProgress({ activities: [], feedbackCount: 0, connectionsCount: 0 });
    expect(p.doneCount).toBe(0);
    expect(p.stats.activities).toBe(0);
    expect(p.streakDays).toBe(0);
  });

  it("has no XP, level or badge concepts left", () => {
    const p = computeProgress({ activities: days(3), feedbackCount: 2, connectionsCount: 1 });
    const keys = Object.keys(p);
    for (const gone of ["xp", "level", "levelName", "achievements", "unlockedCount"]) {
      expect(keys).not.toContain(gone);
    }
    for (const m of p.milestones) expect(m).not.toHaveProperty("emoji");
  });

  it("rewards connecting real data", () => {
    const done = (i: Parameters<typeof computeProgress>[0], id: string) =>
      computeProgress(i).milestones.find((m) => m.id === id)!.done;
    expect(done({ activities: [], feedbackCount: 0, connectionsCount: 1 }, "connected")).toBe(true);
    expect(done({ activities: [], feedbackCount: 0, connectionsCount: 4 }, "connected-all")).toBe(true);
    expect(
      done({ activities: [], feedbackCount: 0, connectionsCount: 0, hasMeasuredSweatRate: true }, "sweat-measured"),
    ).toBe(true);
  });

  it("tracks the feedback loop that makes plans learn", () => {
    const at = (n: number) => computeProgress({ activities: [], feedbackCount: n, connectionsCount: 0 }).milestones;
    expect(at(1).find((m) => m.id === "first-log")!.done).toBe(true);
    expect(at(1).find((m) => m.id === "learning")!.done).toBe(false);
    expect(at(5).find((m) => m.id === "learning")!.done).toBe(true);
    expect(at(15).find((m) => m.id === "dialled-in")!.done).toBe(true);
  });

  it("counts sessions long enough to need fuelling", () => {
    const long = Array.from({ length: 5 }, (_, i) =>
      act({ durationSec: 100 * 60, startTime: new Date(Date.UTC(2024, 5, 1 + i, 6)).toISOString() }),
    );
    const p = computeProgress({ activities: long, feedbackCount: 0, connectionsCount: 0 });
    expect(p.stats.longSessions).toBe(5);
    expect(p.milestones.find((m) => m.id === "fuelling-practice")!.done).toBe(true);
    expect(p.milestones.find((m) => m.id === "race-rehearsal")!.done).toBe(false);
    const withUltra = computeProgress({
      activities: [...long, act({ durationSec: 3.5 * 3600 })],
      feedbackCount: 0,
      connectionsCount: 0,
    });
    expect(withUltra.milestones.find((m) => m.id === "race-rehearsal")!.done).toBe(true);
  });

  it("computes streaks and weekly load", () => {
    const p = computeProgress({ activities: days(8), feedbackCount: 0, connectionsCount: 0 });
    expect(p.longestStreakDays).toBeGreaterThanOrEqual(7);
    expect(p.milestones.find((m) => m.id === "consistent-week")!.done).toBe(true);
    expect(p.milestones.find((m) => m.id === "big-block")!.done).toBe(false); // 8 × 1 h
  });

  it("every milestone explains why it matters", () => {
    const p = computeProgress({ activities: [], feedbackCount: 0, connectionsCount: 0 });
    for (const m of p.milestones) {
      expect(m.description.length).toBeGreaterThan(30);
      expect(m.category).toBeTruthy();
    }
  });
});
