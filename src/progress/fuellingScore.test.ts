import { describe, expect, it } from "vitest";
import { fuellingScore } from "./fuellingScore";
import type { SessionFeedback } from "../feedback";

const fb = (over: Partial<SessionFeedback> = {}, i = 0): SessionFeedback => ({
  id: `f${i}`,
  date: new Date(Date.UTC(2024, 5, 1 + i)).toISOString(),
  durationMin: 120,
  plannedCarbPerHourG: 60,
  gi: "none",
  energy: "steady",
  ...over,
});

const base = { longSessions: 5, connectionsCount: 1, hasMeasuredSweatRate: false };

describe("fuellingScore", () => {
  it("stays honest with no data — no score, and tells you where to start", () => {
    const s = fuellingScore({ ...base, feedback: [], longSessions: 0, connectionsCount: 0 });
    expect(s.score).toBeNull();
    expect(s.band).toBe("getting-started");
    expect(s.nextActions[0].title).toMatch(/log your next session/i);
  });

  it("scores well-fuelled sessions highly", () => {
    const feedback = Array.from({ length: 6 }, (_, i) => fb({ gi: "none", energy: "strong" }, i));
    const s = fuellingScore({ ...base, feedback, hasMeasuredSweatRate: true });
    expect(s.score!).toBeGreaterThan(85);
    expect(s.band).toBe("dialled-in");
  });

  it("tells a fading athlete with a settled gut to eat more", () => {
    const feedback = Array.from({ length: 5 }, (_, i) => fb({ gi: "none", energy: "faded" }, i));
    const s = fuellingScore({ ...base, feedback });
    expect(s.nextActions.some((a) => /add ~10 g\/h/i.test(a.title))).toBe(true);
  });

  it("tells a gut-limited athlete to back off, not to eat more", () => {
    const feedback = Array.from({ length: 5 }, (_, i) => fb({ gi: "severe", energy: "faded" }, i));
    const s = fuellingScore({ ...base, feedback });
    expect(s.nextActions.some((a) => /lower your carb rate/i.test(a.title))).toBe(true);
    expect(s.nextActions.some((a) => /add ~10 g\/h/i.test(a.title))).toBe(false);
  });

  it("raises a health flag for repeated bonking, not just a performance tip", () => {
    const feedback = Array.from({ length: 4 }, (_, i) => fb({ energy: "bonked" }, i));
    const s = fuellingScore({ ...base, feedback });
    expect(s.healthFlags.join(" ")).toMatch(/low energy availability/i);
  });

  it("flags repeated severe gut distress", () => {
    const feedback = Array.from({ length: 3 }, (_, i) => fb({ gi: "severe" }, i));
    expect(fuellingScore({ ...base, feedback }).healthFlags.length).toBeGreaterThan(0);
  });

  it("suggests measuring sweat rate until it is measured", () => {
    const feedback = [fb()];
    expect(
      fuellingScore({ ...base, feedback }).nextActions.some((a) => /sweat rate/i.test(a.title)),
    ).toBe(true);
    expect(
      fuellingScore({ ...base, feedback, hasMeasuredSweatRate: true }).nextActions.some((a) =>
        /sweat rate/i.test(a.title),
      ),
    ).toBe(false);
  });

  it("detects improvement over recent sessions", () => {
    // Oldest three rough, newest three good (index 0 is newest after sorting).
    const feedback = [
      ...Array.from({ length: 3 }, (_, i) => fb({ gi: "none", energy: "strong" }, 10 + i)),
      ...Array.from({ length: 3 }, (_, i) => fb({ gi: "mild", energy: "bonked" }, i)),
    ];
    const s = fuellingScore({ ...base, feedback });
    expect(s.trend?.direction).toBe("up");
  });

  it("always offers something useful to do next", () => {
    const feedback = Array.from({ length: 8 }, (_, i) => fb({ gi: "none", energy: "strong" }, i));
    const s = fuellingScore({ ...base, feedback, hasMeasuredSweatRate: true, connectionsCount: 4 });
    expect(s.nextActions.length).toBeGreaterThan(0);
    expect(s.nextActions[0].why.length).toBeGreaterThan(20);
  });

  it("weights components to 1 and keeps every score in range", () => {
    const s = fuellingScore({ ...base, feedback: [fb()] });
    expect(s.components.reduce((t, c) => t + c.weight, 0)).toBeCloseTo(1);
    for (const c of s.components) {
      expect(c.score).toBeGreaterThanOrEqual(0);
      expect(c.score).toBeLessThanOrEqual(100);
      expect(c.detail.length).toBeGreaterThan(10);
    }
  });
});
