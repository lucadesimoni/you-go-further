import { describe, it, expect } from "vitest";
import {
  buildSegments,
  cyclingCostPerM,
  findClimbs,
  planRouteFuelling,
  relativeCost,
  relativeSpeed,
  runningCostPerM,
  sportKind,
} from "./routeFuelling";
import type { ElevationSample } from "../geo/swisstopo";

/** Build a profile from (distance km, altitude m) pairs. */
const profile = (pts: [number, number][]): ElevationSample[] =>
  pts.map(([km, altM]) => ({ distanceM: km * 1000, altM }));

/** A flat 20 km. */
const FLAT = profile(Array.from({ length: 21 }, (_, i) => [i, 400]));

/** 20 km: 5 flat, a 600 m climb over 5 km, 5 km of descent, 5 flat. */
const ONE_CLIMB = profile([
  [0, 400],
  [2.5, 400],
  [5, 400],
  [7.5, 700],
  [10, 1000],
  [12.5, 700],
  [15, 400],
  [17.5, 400],
  [20, 400],
]);

describe("energy cost models", () => {
  it("Minetti's polynomial gives the published flat cost of running", () => {
    // ~3.6 J/kg/m on the level is the anchor value of the model.
    expect(runningCostPerM(0)).toBeCloseTo(3.6, 2);
  });

  it("climbing costs more per metre than the flat, descending less", () => {
    expect(runningCostPerM(0.1)).toBeGreaterThan(runningCostPerM(0));
    expect(runningCostPerM(-0.1)).toBeLessThan(runningCostPerM(0));
  });

  it("reproduces Minetti's published cost ratios", () => {
    const ratio = (g: number) => runningCostPerM(g) / runningCostPerM(0);
    // Values straight off the published curve — these are the numbers the whole
    // fuelling distribution rests on, so they are pinned rather than approximated.
    expect(ratio(0.1)).toBeCloseTo(1.66, 1);
    expect(ratio(0.2)).toBeCloseTo(2.5, 1);
    expect(ratio(-0.2)).toBeCloseTo(0.5, 1);
    // The curve has its minimum around −20 %: steeper than that costs more again,
    // because braking is work.
    expect(runningCostPerM(-0.3)).toBeGreaterThan(runningCostPerM(-0.2));
  });

  it("clamps beyond the range the polynomial was fitted over", () => {
    // Outside ±45 % the polynomial diverges; it must not run away.
    expect(runningCostPerM(5)).toBe(runningCostPerM(0.45));
    expect(runningCostPerM(-5)).toBe(runningCostPerM(-0.45));
    expect(Number.isFinite(runningCostPerM(5))).toBe(true);
  });

  it("cycling cost rises steeply uphill and floors on a descent", () => {
    expect(cyclingCostPerM(0)).toBeCloseTo(1, 5);
    expect(cyclingCostPerM(0.1)).toBeGreaterThan(3);
    expect(cyclingCostPerM(-0.1)).toBeLessThan(0.5);
    expect(cyclingCostPerM(-0.5)).toBeGreaterThan(0); // never negative
  });

  it("picks the right model per sport", () => {
    expect(sportKind("cycling")).toBe("ride");
    expect(sportKind("triathlon")).toBe("ride");
    expect(sportKind("running")).toBe("run");
    expect(sportKind("trail-running")).toBe("run");
    expect(sportKind(undefined)).toBe("run");
  });

  it("normalises both sports so flat ground is 1", () => {
    expect(relativeCost("run", 0)).toBeCloseTo(1, 5);
    expect(relativeCost("ride", 0)).toBeCloseTo(1, 5);
  });

  it("climbs are slower and descents faster, within sane bounds", () => {
    expect(relativeSpeed("run", 0.1)).toBeLessThan(1);
    expect(relativeSpeed("run", -0.1)).toBeGreaterThan(1);
    expect(relativeSpeed("run", 0.4)).toBeGreaterThan(0); // never stops dead
    expect(relativeSpeed("ride", -0.2)).toBeLessThanOrEqual(2.2);
  });
});

describe("buildSegments", () => {
  it("spreads cost evenly across a flat route", () => {
    const { segments } = buildSegments(FLAT, "run", 120);
    const shares = segments.map((s) => s.costShare);
    const spread = Math.max(...shares) - Math.min(...shares);
    expect(spread).toBeLessThan(0.001);
  });

  it("concentrates cost on the climb, not the descent", () => {
    const { segments } = buildSegments(ONE_CLIMB, "run", 150);
    const climbShare = segments.filter((s) => s.gradePct > 5).reduce((a, s) => a + s.costShare, 0);
    const descentShare = segments.filter((s) => s.gradePct < -5).reduce((a, s) => a + s.costShare, 0);
    expect(climbShare).toBeGreaterThan(descentShare * 2);
  });

  it("puts the athlete later in the ride on a climb than distance alone would", () => {
    const { segments } = buildSegments(ONE_CLIMB, "run", 150);
    const atTop = segments.find((s) => s.fromKm >= 10)!;
    // The summit is at half the distance but well past half the time, because
    // the climb is slow — this is what puts a feed at the right minute.
    expect(atTop.atMin).toBeGreaterThan(75);
  });

  it("elapsed time never goes backwards", () => {
    const { segments } = buildSegments(ONE_CLIMB, "ride", 90);
    for (let i = 1; i < segments.length; i++) {
      expect(segments[i].atMin).toBeGreaterThanOrEqual(segments[i - 1].atMin);
    }
  });

  it("handles a degenerate profile without throwing", () => {
    expect(buildSegments([], "run", 60).segments).toEqual([]);
    expect(buildSegments([{ distanceM: 0, altM: 100 }], "run", 60).segments).toEqual([]);
    // Repeated distances (a stationary GPS sample) must not divide by zero.
    const repeated = [
      { distanceM: 0, altM: 100 },
      { distanceM: 0, altM: 100 },
      { distanceM: 1000, altM: 150 },
    ];
    expect(buildSegments(repeated, "run", 60).segments.length).toBe(1);
  });
});

describe("findClimbs", () => {
  it("finds a sustained climb and measures its gain", () => {
    const { segments } = buildSegments(ONE_CLIMB, "run", 150);
    const climbs = findClimbs(segments);
    expect(climbs).toHaveLength(1);
    expect(climbs[0].gainM).toBeGreaterThan(500);
    expect(climbs[0].fromKm).toBeCloseTo(5, 0);
  });

  it("ignores ramps too small to be worth a feed", () => {
    const bumpy = profile([
      [0, 400],
      [1, 420],
      [2, 400],
      [3, 420],
      [4, 400],
    ]);
    expect(findClimbs(buildSegments(bumpy, "run", 40).segments)).toEqual([]);
  });

  it("does not split a climb at a brief flat spot", () => {
    const stepped = profile([
      [0, 400],
      [2, 600],
      [3, 605], // a false flat mid-climb
      [5, 850],
      [7, 400],
    ]);
    const climbs = findClimbs(buildSegments(stepped, "run", 90).segments);
    expect(climbs).toHaveLength(1);
    expect(climbs[0].gainM).toBeGreaterThan(400);
  });

  it("closes a climb that runs to the finish", () => {
    const uphillFinish = profile([
      [0, 400],
      [2, 400],
      [5, 900],
    ]);
    const climbs = findClimbs(buildSegments(uphillFinish, "run", 60).segments);
    expect(climbs).toHaveLength(1);
    expect(climbs[0].toKm).toBeCloseTo(5, 0);
  });
});

describe("planRouteFuelling", () => {
  const plan = (samples: ElevationSample[], over: Partial<Parameters<typeof planRouteFuelling>[0]> = {}) =>
    planRouteFuelling({ samples, activity: "trail-running", durationMin: 180, carbPerHourG: 60, ...over });

  it("says nothing to do on a short session", () => {
    const p = plan(FLAT, { durationMin: 40 });
    expect(p.stops).toEqual([]);
    expect(p.notes.join(" ")).toMatch(/no on-route feeds/i);
  });

  it("schedules roughly the session's carbohydrate target", () => {
    const p = plan(FLAT);
    // 60 g/h × 3 h = 180 g; doses land within a reasonable band of that.
    expect(p.totalCarbG).toBeGreaterThan(120);
    expect(p.totalCarbG).toBeLessThanOrEqual(180);
  });

  it("puts a feed BEFORE the climb, not on it", () => {
    const p = plan(ONE_CLIMB);
    const climb = p.climbs[0];
    const prep = p.stops.find((s) => s.kind === "climb-prep");
    expect(prep).toBeDefined();
    expect(prep!.atMin).toBeLessThan(climb.startMin);
    expect(prep!.reason).toMatch(/before the .* climb/i);
  });

  it("keeps feeds off a steep descent", () => {
    const p = plan(ONE_CLIMB);
    for (const s of p.stops) {
      const seg = p.segments.filter((g) => g.atMin <= s.atMin).pop();
      // Nothing should be scheduled on a genuinely steep descent.
      expect(seg?.gradePct ?? 0).toBeGreaterThan(-6);
    }
  });

  it("never schedules a feed in the last ten minutes", () => {
    const p = plan(ONE_CLIMB);
    for (const s of p.stops) expect(s.atMin).toBeLessThanOrEqual(p.estimatedMin - 10);
  });

  it("respects gut spacing — no two feeds closer than 15 minutes", () => {
    const p = plan(ONE_CLIMB, { carbPerHourG: 90 });
    for (let i = 1; i < p.stops.length; i++) {
      expect(p.stops[i].atMin - p.stops[i - 1].atMin).toBeGreaterThanOrEqual(15);
    }
  });

  it("stops are in order and carry a real position", () => {
    const p = plan(ONE_CLIMB);
    for (let i = 1; i < p.stops.length; i++) expect(p.stops[i].atMin).toBeGreaterThan(p.stops[i - 1].atMin);
    for (const s of p.stops) {
      expect(s.atKm).toBeGreaterThanOrEqual(0);
      expect(s.altM).toBeGreaterThan(0);
      expect(s.carbG).toBeGreaterThan(0);
    }
  });

  it("warns about the long unfeedable descent after a big climb", () => {
    const p = plan(ONE_CLIMB);
    expect(p.notes.join(" ")).toMatch(/won't be able to eat/i);
  });

  it("says plainly when a flat route just needs the clock", () => {
    expect(plan(FLAT).notes.join(" ")).toMatch(/eat to the clock/i);
  });

  it("flags when terrain prevents hitting the target", () => {
    // A relentless descent leaves few workable feed points.
    const plunge = profile([
      [0, 2000],
      [5, 1400],
      [10, 800],
      [15, 400],
    ]);
    const p = plan(plunge, { carbPerHourG: 90 });
    const shortfall = p.notes.find((n) => /against a .* target/.test(n));
    if (p.totalCarbG < 90 * (p.estimatedMin / 60) * 0.8) expect(shortfall).toBeDefined();
  });

  it("produces nothing rather than nonsense without a profile or a target", () => {
    expect(plan([], {}).stops).toEqual([]);
    expect(plan(FLAT, { carbPerHourG: 0 }).stops).toEqual([]);
  });

  it("a cyclist and a runner get different timings on the same route", () => {
    const runner = plan(ONE_CLIMB, { activity: "trail-running" });
    const rider = plan(ONE_CLIMB, { activity: "cycling" });
    // Both should fuel, but the cost/speed models differ enough to move stops.
    expect(runner.stops.length).toBeGreaterThan(0);
    expect(rider.stops.length).toBeGreaterThan(0);
    expect(runner.segments[5].atMin).not.toBe(rider.segments[5].atMin);
  });
});
