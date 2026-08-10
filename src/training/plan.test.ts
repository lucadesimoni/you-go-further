import { describe, expect, it } from "vitest";
import { eventById } from "../events";
import type { SwissEvent } from "../events";
import type { Activity } from "../model";
import { buildTrainingPlan, longSessionShare, mondayOf, recentWeeklyHours } from "./plan";

const JUNGFRAU = eventById("jungfrau-marathon") as SwissEvent;
const EIGER = eventById("eiger-ultra-e101") as SwissEvent;
const NOW = new Date("2026-05-01T08:00:00Z");

const plan = (over: Partial<Parameters<typeof buildTrainingPlan>[0]> = {}) =>
  buildTrainingPlan({ event: JUNGFRAU, estimatedMin: 330, raceCarbPerHourG: 90, now: NOW, ...over });

/** A week of training, `hours` split across three sessions. */
function week(weekStartIso: string, hours: number): Activity[] {
  const base = Date.parse(`${weekStartIso}T07:00:00Z`);
  return [0, 2, 5].map((d, i) => ({
    id: `${weekStartIso}-${i}`,
    provider: "strava" as const,
    externalId: `${weekStartIso}-${i}`,
    sport: "run" as const,
    startTime: new Date(base + d * 86_400_000).toISOString(),
    durationSec: Math.round(((hours * 3600) / 3) * (d === 5 ? 1.4 : 0.8)),
    distanceM: 10_000,
  }));
}

describe("starting from where the athlete is", () => {
  it("reads the current weekly volume from their own sessions", () => {
    const acts = [week("2026-04-06", 6), week("2026-04-13", 6), week("2026-04-20", 6)].flat();
    const p = plan({ activities: acts });
    expect(p.startSource).toBe("measured");
    expect(p.startHours).toBeGreaterThan(4);
    expect(p.startHours).toBeLessThan(8);
  });

  it("takes the median week, so one holiday or one heroic week does not set the plan", () => {
    const acts = [week("2026-04-06", 5), week("2026-04-13", 5), week("2026-04-20", 20)].flat();
    expect(recentWeeklyHours(acts, NOW)).toBeLessThan(8);
  });

  it("says when it is guessing rather than quietly assuming a base", () => {
    const p = plan();
    expect(p.startSource).toBe("assumed");
    // And the guess is deliberately small: opening at ten hours for someone
    // doing four is not ambition, it is an injury.
    expect(p.startHours).toBeLessThanOrEqual(5);
  });

  it("never opens above what the athlete is already doing", () => {
    const acts = [week("2026-04-06", 3), week("2026-04-13", 3), week("2026-04-20", 3)].flat();
    const p = plan({ activities: acts });
    expect(p.startHours).toBeLessThanOrEqual(4);
  });
});

describe("progression, within a limit", () => {
  it("actually builds, rather than treading water", () => {
    // Growing the next week from a *cut-back* week meant three up and one down
    // netted almost nothing: fifteen weeks moved an athlete from 4 h to 4.7 h.
    const p = plan();
    expect(p.peakHours).toBeGreaterThan(p.startHours * 2);
  });

  it("cuts back roughly every fourth week", () => {
    const p = plan();
    const cuts = p.weeks.filter((w) => w.recovery);
    expect(cuts.length).toBeGreaterThan(2);
    for (const c of cuts) {
      const prev = p.weeks[c.index - 2];
      if (prev) expect(c.hours, `week ${c.index}`).toBeLessThan(prev.hours);
    }
  });

  it("never raises the trend by more than a tenth in a week", () => {
    // The plan is generated and nobody is watching it; the failure mode of an
    // unbounded ramp is a stress fracture.
    const p = plan();
    const build = p.weeks.filter((w) => w.phase === "base" || w.phase === "build" || w.phase === "peak");
    for (const [i, w] of build.entries()) {
      const prev = build[i - 1];
      if (!prev || w.recovery || prev.recovery) continue;
      expect(w.hours / prev.hours, `week ${w.index}`).toBeLessThanOrEqual(1.11);
    }
  });

  it("tapers from the peak the build reached, not from last week", () => {
    // Reading it off a cut-back week put the first taper week above the peak
    // weeks before it, which is not a taper.
    const p = plan();
    for (const w of p.weeks.filter((x) => x.phase === "taper" || x.phase === "raceWeek")) {
      expect(w.hours, `week ${w.index}`).toBeLessThan(p.peakHours);
    }
  });

  it("comes down into the race", () => {
    const p = plan();
    const taper = p.weeks.filter((w) => w.phase === "taper");
    const raceWeek = p.weeks[p.weeks.length - 1];
    expect(taper.length).toBeGreaterThan(0);
    expect(raceWeek.phase).toBe("raceWeek");
    expect(raceWeek.hours).toBeLessThan(taper[taper.length - 1].hours);
  });

  it("stays inside a sane ceiling however long the runway", () => {
    const p = plan({ now: new Date("2025-01-01T08:00:00Z") });
    for (const w of p.weeks) expect(w.hours).toBeLessThanOrEqual(18);
  });
});

describe("fuelling is periodised with the training", () => {
  it("climbs the long-run carbohydrate rate to the race rate", () => {
    const p = plan({ raceCarbPerHourG: 90 });
    const first = p.weeks[0].longRunCarbPerHourG;
    const peakWeeks = p.weeks.filter((w) => w.phase === "peak");
    expect(first).toBeLessThan(90);
    expect(peakWeeks[peakWeeks.length - 1].longRunCarbPerHourG).toBe(90);
  });

  it("never exceeds the race rate — the build rehearses it, it does not outbid it", () => {
    const p = plan({ raceCarbPerHourG: 75 });
    for (const w of p.weeks) expect(w.longRunCarbPerHourG).toBeLessThanOrEqual(75);
  });

  it("rises monotonically, so the gut is never asked to go backwards", () => {
    const p = plan();
    const rates = p.weeks.map((w) => w.longRunCarbPerHourG);
    for (const [i, r] of rates.entries()) if (i > 0) expect(r).toBeGreaterThanOrEqual(rates[i - 1]);
  });

  it("puts the carbohydrate on the long day, not on the hard short one", () => {
    // A threshold session is not where a gut is trained, and asking for race
    // rate there teaches nothing while spoiling a session with another job.
    for (const w of plan().weeks) {
      for (const s of w.sessions) {
        if (s.kind === "quality" || s.kind === "easy") expect(s.carbPerHourG).toBe(0);
        if (s.kind === "long") expect(s.carbPerHourG).toBeGreaterThan(0);
      }
    }
  });

  it("starts from what the athlete already tolerates when their logs say", () => {
    const low = plan({ currentCarbPerHourG: 40 });
    const high = plan({ currentCarbPerHourG: 80 });
    expect(low.weeks[0].longRunCarbPerHourG).toBeLessThan(high.weeks[0].longRunCarbPerHourG);
  });
});

describe("the shape of the race decides the shape of the plan", () => {
  it("rehearses most of a marathon and much less of a hundred kilometres", () => {
    expect(longSessionShare(180)).toBeGreaterThan(longSessionShare(1500));
    const road = plan({ estimatedMin: 200 });
    const ultra = plan({ event: EIGER, estimatedMin: 1500, raceCarbPerHourG: 80 });
    expect(road.peakLongMin / 200).toBeGreaterThan(ultra.peakLongMin / 1500);
  });

  it("uses back-to-back weekends for an ultra, because the point is running tired", () => {
    const ultra = plan({ event: EIGER, estimatedMin: 1500, raceCarbPerHourG: 80 });
    const backToBack = ultra.weeks.filter((w) => w.sessions.filter((s) => s.kind === "long").length > 1);
    expect(backToBack.length).toBeGreaterThan(0);
  });

  it("does not send a marathon runner out on two long days", () => {
    for (const w of plan().weeks) {
      expect(w.sessions.filter((s) => s.kind === "long").length).toBeLessThanOrEqual(1);
    }
  });

  it("puts hills in the week for a climbing race", () => {
    const focus = plan().weeks.flatMap((w) => w.sessions.map((s) => s.focusId));
    expect(focus).toContain("hills"); // Jungfrau climbs ~43 m/km
    // A flat race that is still ahead of `NOW` — a past one yields only a race
    // week, and then the plan has no midweek quality session to check.
    const flat = plan({ event: eventById("lausanne-marathon") as SwissEvent, estimatedMin: 210 });
    expect(flat.weeks.flatMap((w) => w.sessions.map((s) => s.focusId))).toContain("threshold");
  });

  it("reports a peak long session that appears in the plan", () => {
    // It was read off the target before the week's own cap applied, so the plan
    // claimed a 525-minute long day that existed nowhere in it.
    for (const p of [plan(), plan({ event: EIGER, estimatedMin: 1500, raceCarbPerHourG: 80 })]) {
      const longest = Math.max(
        ...p.weeks.flatMap((w) => w.sessions.filter((s) => s.kind === "long").map((s) => s.durationMin)),
      );
      expect(p.peakLongMin).toBe(longest);
    }
  });
});

describe("the calendar", () => {
  it("starts on a Monday and ends in the week of the race", () => {
    const p = plan();
    for (const w of p.weeks) expect(mondayOf(w.startDate)).toBe(w.startDate);
    expect(p.weeks[p.weeks.length - 1].startDate).toBe(mondayOf(JUNGFRAU.date));
  });

  it("counts down to zero weeks out", () => {
    const p = plan();
    expect(p.weeks[p.weeks.length - 1].weeksOut).toBe(0);
    const outs = p.weeks.map((w) => w.weeksOut);
    expect([...outs].sort((a, b) => b - a)).toEqual(outs);
  });

  it("says plainly when there is not enough time to prepare", () => {
    const p = plan({ now: new Date("2026-09-01T08:00:00Z") });
    expect(p.tooShort).toBe(true);
  });

  it("does not claim a race already run needs a build", () => {
    const p = plan({ now: new Date("2026-10-01T08:00:00Z") });
    expect(p.tooShort).toBeUndefined();
  });
});

describe("what the plan claims about itself", () => {
  it("reports a peak that is a week in the plan", () => {
    // Read off the build trend, a two-week taper plan announced "peaks at 7 h a
    // week" while every week in it was 3.5 h or less.
    for (const p of [plan(), plan({ now: new Date("2026-09-01T08:00:00Z") }), plan({ event: EIGER, estimatedMin: 1500, raceCarbPerHourG: 80 })]) {
      expect(p.peakHours).toBe(Math.max(...p.weeks.map((w) => w.hours)));
    }
  });

  it("does not tell a tapering athlete to train their gut", () => {
    // The work is done by then; the job is to arrive fresh having rehearsed.
    for (const w of plan().weeks.filter((x) => x.phase === "taper")) {
      for (const s of w.sessions.filter((x) => x.kind === "long")) {
        expect(s.focusId).not.toBe("gutTraining");
      }
    }
  });
});
