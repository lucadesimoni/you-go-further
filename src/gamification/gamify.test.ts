import { describe, expect, it } from "vitest";
import { computeGamification } from "./gamify";
import { levelForXp, xpToReach } from "./levels";
import type { Activity } from "../model";

function act(over: Partial<Activity> & { id: string; startTime: string }): Activity {
  return { provider: "strava", externalId: over.id, sport: "ride", durationSec: 3600, ...over } as Activity;
}

const daily = (n: number): Activity[] =>
  Array.from({ length: n }, (_, i) => {
    const d = new Date(Date.UTC(2026, 5, 1) + i * 86_400_000);
    return act({ id: `a${i}`, startTime: d.toISOString() });
  });

describe("levels", () => {
  it("has an increasing cumulative XP curve", () => {
    expect(xpToReach(1)).toBe(0);
    expect(xpToReach(2)).toBeGreaterThan(xpToReach(1));
    expect(xpToReach(3)).toBeGreaterThan(xpToReach(2));
  });

  it("resolves XP into level + within-level progress", () => {
    const p = levelForXp(0);
    expect(p.level).toBe(1);
    expect(p.xpIntoLevel).toBe(0);
    const p2 = levelForXp(xpToReach(3) + 10);
    expect(p2.level).toBe(3);
    expect(p2.xpIntoLevel).toBe(10);
  });
});

describe("computeGamification", () => {
  it("awards XP and starts at level 1 with no data", () => {
    const g = computeGamification({ activities: [], feedbackCount: 0, connectionsCount: 0 });
    expect(g.xp).toBe(0);
    expect(g.level).toBe(1);
    expect(g.unlockedCount).toBe(0);
  });

  it("unlocks the starter and streak achievements", () => {
    const g = computeGamification({ activities: daily(8), feedbackCount: 0, connectionsCount: 0 });
    const ids = g.achievements.filter((a) => a.unlocked).map((a) => a.id);
    expect(ids).toContain("getting-started");
    expect(ids).toContain("consistent-7");
    expect(g.longestStreakDays).toBeGreaterThanOrEqual(7);
    expect(g.level).toBeGreaterThan(1); // XP accumulated
  });

  it("unlocks feedback- and connection-based achievements", () => {
    const g = computeGamification({ activities: daily(3), feedbackCount: 5, connectionsCount: 4 });
    const ids = g.achievements.filter((a) => a.unlocked).map((a) => a.id);
    expect(ids).toContain("gut-trained");
    expect(ids).toContain("fully-wired");
  });

  it("unlocks distance/duration milestones", () => {
    const g = computeGamification({
      activities: [act({ id: "big", startTime: "2026-06-01T06:00:00Z", distanceM: 120000, durationSec: 4 * 3600 })],
      feedbackCount: 0,
      connectionsCount: 0,
    });
    const ids = g.achievements.filter((a) => a.unlocked).map((a) => a.id);
    expect(ids).toContain("centurion");
    expect(ids).toContain("long-hauler");
  });

  it("XP includes activity, feedback, connection and achievement bonuses", () => {
    const g = computeGamification({ activities: daily(3), feedbackCount: 1, connectionsCount: 1 });
    // 3*12 + 1*20 + 1*30 + getting-started(20) = 106
    expect(g.xp).toBe(106);
    expect(g.stats.activities).toBe(3);
  });
});
