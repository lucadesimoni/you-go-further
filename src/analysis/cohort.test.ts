import { describe, it, expect } from "vitest";
import {
  bandFor,
  cohortPrior,
  MIN_BAND_SAMPLES,
  observe,
  summariseBands,
  wellToleratedCeilingG,
  wilson,
  type CohortObservation,
} from "./cohort";
import type { SessionFeedback } from "../feedback";

const log = (over: Partial<SessionFeedback> = {}): SessionFeedback => ({
  id: "f",
  date: "2026-07-01T00:00:00.000Z",
  durationMin: 120,
  plannedCarbPerHourG: 70,
  gi: "none",
  energy: "steady",
  ...over,
});

/** `n` observations in one band, `distress` of which went badly. */
const obs = (band: CohortObservation["band"], n: number, distress = 0, faded = 0): CohortObservation[] =>
  Array.from({ length: n }, (_, i) => ({ band, gutDistress: i < distress, faded: i < faded }));

describe("bandFor", () => {
  it("puts a rate in the band that straddles the transporter limits", () => {
    expect(bandFor(30)).toBe("under-40");
    expect(bandFor(60)).toBe("60-80");
    expect(bandFor(95)).toBe("80-100");
    expect(bandFor(140)).toBe("over-100");
  });

  it("puts a boundary rate in the band that starts there", () => {
    expect(bandFor(40)).toBe("40-60");
    expect(bandFor(80)).toBe("80-100");
  });
});

describe("observe", () => {
  it("records the rate actually taken, never the one we advised", () => {
    // Using the planned rate would make the cohort agree with our own advice.
    expect(observe(log({ plannedCarbPerHourG: 90 }))).toBeNull();
    expect(observe(log({ actualCarbPerHourG: 90 }))!.band).toBe("80-100");
  });

  it("counts mild distress, not just severe", () => {
    expect(observe(log({ actualCarbPerHourG: 70, gi: "mild" }))!.gutDistress).toBe(true);
    expect(observe(log({ actualCarbPerHourG: 70, gi: "none" }))!.gutDistress).toBe(false);
  });

  it("carries nothing that identifies the athlete or the session", () => {
    const o = observe(log({ actualCarbPerHourG: 70, activityId: "strava:123", id: "f-9" }))!;
    expect(Object.keys(o).sort()).toEqual(["band", "faded", "gutDistress"]);
  });
});

describe("wilson", () => {
  it("never returns an impossible interval, even at zero", () => {
    const w = wilson(0, 20);
    expect(w.low).toBeGreaterThanOrEqual(0);
    expect(w.high).toBeLessThanOrEqual(1);
    // Zero observed does not mean zero risk, and the interval must say so.
    expect(w.high).toBeGreaterThan(0);
  });

  it("narrows as the sample grows", () => {
    const small = wilson(5, 10);
    const large = wilson(500, 1000);
    expect(large.high - large.low).toBeLessThan(small.high - small.low);
  });

  it("is honest about 3 of 4 — not 75%", () => {
    const w = wilson(3, 4);
    expect(w.low).toBeLessThan(0.5);
    expect(w.high).toBeGreaterThan(0.9);
  });
});

describe("cohortPrior", () => {
  it("refuses to speak from a handful of sessions", () => {
    const prior = cohortPrior(90, obs("80-100", 4, 3));
    expect(prior.known).toBe(false);
    expect(prior.distressRate).toBeUndefined();
    expect(prior.text).toMatch(/not enough/i);
  });

  it("reports frequency, with the sample size attached", () => {
    const prior = cohortPrior(90, obs("80-100", 40, 10));
    expect(prior.known).toBe(true);
    expect(prior.distressRate).toBe(0.25);
    expect(prior.text).toMatch(/1 session in 4/);
    expect(prior.text).toMatch(/40 logged/);
  });

  it("says plainly when a rate has caused no trouble", () => {
    const prior = cohortPrior(50, obs("40-60", 30, 0));
    expect(prior.text).toMatch(/No gut trouble/i);
    // But the interval still admits the risk is not literally zero.
    expect(prior.high!).toBeGreaterThan(0);
  });

  it("only counts observations from the band being asked about", () => {
    const mixed = [...obs("40-60", 30, 0), ...obs("over-100", 30, 25)];
    expect(cohortPrior(50, mixed).distressRate).toBe(0);
    expect(cohortPrior(120, mixed).distressRate!).toBeGreaterThan(0.5);
  });
});

describe("summariseBands", () => {
  it("marks a band reliable only at the threshold", () => {
    const just = summariseBands(obs("60-80", MIN_BAND_SAMPLES)).find((s) => s.band === "60-80")!;
    const short = summariseBands(obs("60-80", MIN_BAND_SAMPLES - 1)).find((s) => s.band === "60-80")!;
    expect(just.reliable).toBe(true);
    expect(short.reliable).toBe(false);
  });

  it("reports every band, including the empty ones", () => {
    expect(summariseBands([])).toHaveLength(5);
    expect(summariseBands([]).every((s) => s.n === 0 && !s.reliable)).toBe(true);
  });

  it("tracks fading separately from gut trouble — they are different failures", () => {
    const s = summariseBands(obs("40-60", 20, 0, 12)).find((x) => x.band === "40-60")!;
    expect(s.distressRate).toBe(0);
    expect(s.fadeRate).toBe(0.6);
  });
});

describe("wellToleratedCeilingG", () => {
  it("suggests the highest rate the population handles well", () => {
    const data = [...obs("60-80", 30, 2), ...obs("80-100", 30, 3), ...obs("over-100", 30, 20)];
    expect(wellToleratedCeilingG(data)).toBe(100);
  });

  it("suggests nothing at all before there is data", () => {
    expect(wellToleratedCeilingG(obs("60-80", 3))).toBeUndefined();
  });

  it("ignores a band that looks good but is too small to trust", () => {
    const data = [...obs("40-60", 30, 1), ...obs("over-100", 5, 0)];
    expect(wellToleratedCeilingG(data)).toBe(60);
  });
});
