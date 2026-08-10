import { describe, expect, it } from "vitest";
import { eventById } from "../events";
import type { SwissEvent } from "../events";
import type { SessionFeedback } from "../feedback";
import { buildTrainingPlan } from "./plan";
import { planLearnings, prepStats, sessionFuelling, type FuellingContext } from "./fuelling";

const JUNGFRAU = eventById("jungfrau-marathon") as SwissEvent;
const NOW = new Date("2026-05-01T08:00:00Z");
const ctx: FuellingContext = { event: JUNGFRAU, bodyWeightKg: 70, sweatLevel: "average", conditions: "temperate" };
const plan = buildTrainingPlan({ event: JUNGFRAU, estimatedMin: 330, raceCarbPerHourG: 90, now: NOW });
const sessions = plan.weeks.flatMap((w) => w.sessions.filter((s) => s.kind !== "rest"));

describe("every session gets before, during and after", () => {
  it("gives all three to every session in the plan", () => {
    for (const s of sessions) {
      const f = sessionFuelling(s, ctx);
      expect(f.pre.carbG, s.kind).toBeGreaterThan(0);
      expect(f.pre.fluidMl).toBeGreaterThan(0);
      expect(f.after.carbG, s.kind).toBeGreaterThan(0);
      expect(f.after.proteinG).toBeGreaterThan(0);
      expect(f.during.fluidPerHourMl).toBeGreaterThan(0);
    }
  });

  it("lets the plan's progression own the long day", () => {
    // The rehearsal rate is deliberately below what today alone would need in
    // the early weeks; an engine that only knows about today would overwrite
    // the ramp and the athlete would meet race rate untrained.
    for (const w of plan.weeks) {
      for (const s of w.sessions.filter((x) => x.kind === "long")) {
        const f = sessionFuelling(s, ctx);
        expect(f.during.carbPerHourG).toBe(w.longRunCarbPerHourG);
        expect(f.during.rehearsalRateG).toBe(w.longRunCarbPerHourG);
      }
    }
  });

  it("still fuels a long hard session the plan set no rehearsal rate for", () => {
    // Reading the plan's zero as "eat nothing" left a 93-minute threshold
    // session unfuelled, which is not what "the gut is not trained here" meant.
    const quality = sessions.find((s) => s.kind === "quality" && s.durationMin >= 90);
    expect(quality).toBeDefined();
    const f = sessionFuelling(quality!, ctx);
    expect(f.during.carbPerHourG).toBeGreaterThan(0);
    expect(f.during.rehearsalRateG).toBe(0);
  });

  it("scales with the session rather than handing out one dose for everything", () => {
    const short = sessionFuelling({ dayOffset: 3, kind: "easy", durationMin: 39, carbPerHourG: 0, focusId: "recovery" }, ctx);
    const longOne = sessionFuelling({ dayOffset: 6, kind: "long", durationMin: 180, carbPerHourG: 85, focusId: "raceRehearsal" }, ctx);
    expect(longOne.pre.carbG).toBeGreaterThan(short.pre.carbG);
    expect(longOne.after.carbG).toBeGreaterThan(short.after.carbG);
    expect(longOne.during.totalCarbG).toBeGreaterThan(short.during.totalCarbG);
  });

  it("hands back the session the planner would take, so it can be opened there", () => {
    const f = sessionFuelling(sessions[0], ctx);
    expect(f.input.bodyWeightKg).toBe(70);
    expect(f.input.durationMin).toBeGreaterThan(0);
  });
});

describe("preparation statistics", () => {
  const stats = prepStats(plan);

  it("counts what the build actually asks for", () => {
    expect(stats.sessions).toBe(sessions.length);
    expect(stats.hours).toBeCloseTo(plan.weeks.reduce((s, w) => s + w.hours, 0), 1);
    expect(stats.longSessions).toBeGreaterThan(0);
  });

  it("counts the rehearsals at full race rate, and says when they start", () => {
    expect(stats.sessionsAtRaceRate).toBeGreaterThan(0);
    expect(stats.weeksToRaceRate).toBeDefined();
    expect(stats.longestAtRaceRateMin).toBeGreaterThan(0);
  });

  it("does not count race day as a rehearsal — it is the exam", () => {
    const raceWeek = plan.weeks[plan.weeks.length - 1];
    const raceDay = raceWeek.sessions.find((s) => s.kind === "race");
    expect(raceDay).toBeDefined();
    expect(stats.longestAtRaceRateMin).toBeLessThan(raceDay!.durationMin);
  });

  it("adds up the carbohydrate the athlete will practise with", () => {
    expect(stats.carbToPractiseG).toBeGreaterThan(1000);
  });
});

describe("learnings, from this athlete's data", () => {
  const stats = prepStats(plan);
  const log = (over: Partial<SessionFeedback>): SessionFeedback => ({
    id: Math.random().toString(),
    date: "2026-04-20T08:00:00Z",
    durationMin: 150,
    plannedCarbPerHourG: 70,
    gi: "none",
    energy: "steady",
    ...over,
  });

  it("asks for a log rather than inventing an insight", () => {
    const ids = planLearnings(plan, stats, { estimatedMin: 330 }).map((l) => l.id);
    expect(ids).toContain("noLogsYet");
    expect(ids).not.toContain("toleratesRate");
  });

  it("respects a ceiling the athlete's own gut has demonstrated", () => {
    // Telling somebody whose logs show distress at 60 to aim for 90 is how a
    // plan loses an athlete's trust.
    const feedback = [
      log({ gi: "severe", actualCarbPerHourG: 60 }),
      log({ gi: "severe", actualCarbPerHourG: 62 }),
      log({ gi: "mild", actualCarbPerHourG: 58 }),
    ];
    const found = planLearnings(plan, stats, { estimatedMin: 330, feedback }).find(
      (l) => l.id === "gutCeilingBelowTarget",
    );
    expect(found).toBeDefined();
    expect(found!.values.target).toBe(90);
    expect(found!.values.ceiling).toBeLessThan(90);
    expect(found!.severity).toBe("act");
  });

  it("says so when the logs show the rate is already tolerated", () => {
    const feedback = [log({ actualCarbPerHourG: 90 }), log({ actualCarbPerHourG: 95 }), log({ actualCarbPerHourG: 88 })];
    const ids = planLearnings(plan, stats, { estimatedMin: 330, feedback }).map((l) => l.id);
    expect(ids).toContain("toleratesRate");
    expect(ids).not.toContain("gutCeilingBelowTarget");
  });

  it("flags a plan with too few chances to rehearse the real rate", () => {
    const rushed = buildTrainingPlan({
      event: JUNGFRAU,
      estimatedMin: 330,
      raceCarbPerHourG: 90,
      now: new Date("2026-08-20T08:00:00Z"),
    });
    const ids = planLearnings(rushed, prepStats(rushed), { estimatedMin: 330 }).map((l) => l.id);
    expect(ids).toContain("fewRaceRateSessions");
  });

  it("always ends on the thing athletes skip", () => {
    const ids = planLearnings(plan, stats, { estimatedMin: 330 }).map((l) => l.id);
    expect(ids[ids.length - 1]).toBe("practiseProducts");
  });

  it("carries numbers rather than sentences, so each locale writes its own", () => {
    for (const l of planLearnings(plan, stats, { estimatedMin: 330 })) {
      expect(["info", "act"]).toContain(l.severity);
      expect(Object.values(l.values).every((v) => typeof v === "number")).toBe(true);
    }
  });
});

describe("it does not read the target back as the athlete's own data", () => {
  const stats = prepStats(plan);
  const log = (rate: number): SessionFeedback => ({
    id: Math.random().toString(),
    date: "2026-04-20T08:00:00Z",
    durationMin: 150,
    plannedCarbPerHourG: rate,
    actualCarbPerHourG: rate,
    gi: "none",
    energy: "steady",
  });

  it("reports the rate the logs show, not the one the race wants", () => {
    // "Your logs already show 105 g/h" to somebody whose best session was 72 is
    // the invented personalisation this whole list exists to avoid.
    const feedback = [log(72), log(65), log(38)];
    const found = planLearnings(plan, stats, { estimatedMin: 330, feedback }).find(
      (l) => l.id === "belowTargetSoFar",
    );
    expect(found).toBeDefined();
    expect(found!.values.best).toBe(72);
    expect(found!.values.target).toBe(90);
  });

  it("only claims tolerance once the logs actually reach the rate", () => {
    const ids = planLearnings(plan, stats, { estimatedMin: 330, feedback: [log(95), log(92), log(90)] }).map((l) => l.id);
    expect(ids).toContain("toleratesRate");
    expect(ids).not.toContain("belowTargetSoFar");
  });
});
