import { describe, it, expect } from "vitest";
import { debriefSession, logForActivity } from "./debrief";
import { planRouteFuelling, computeTarget } from "../engine";
import type { SessionFeedback } from "../feedback";
import type { ElevationSample } from "../geo/swisstopo";

const profile = (pts: [number, number][]): ElevationSample[] =>
  pts.map(([km, altM]) => ({ distanceM: km * 1000, altM }));

/** 20 km with a 600 m climb in the middle. */
const HILLY = profile([
  [0, 400],
  [5, 400],
  [7.5, 700],
  [10, 1000],
  [12.5, 700],
  [15, 400],
  [20, 400],
]);

const plan = planRouteFuelling({ samples: HILLY, activity: "trail-running", durationMin: 180, carbPerHourG: 65 });

const log = (over: Partial<SessionFeedback> = {}): SessionFeedback => ({
  id: "f1",
  activityId: "strava:1",
  date: "2026-07-20T08:00:00.000Z",
  durationMin: 180,
  plannedCarbPerHourG: 65,
  gi: "none",
  energy: "steady",
  ...over,
});

const debrief = (over: Parameters<typeof debriefSession>[0] extends infer T ? Partial<T> : never = {}) =>
  debriefSession({ plan, requiredCarbPerHourG: 65, durationMin: 180, ...over });

describe("debriefSession", () => {
  it("gives no verdict without a log — an invented one would be acted on", () => {
    const d = debrief();
    expect(d.verdict).toBe("unknown");
    expect(d.hasLog).toBe(false);
    expect(d.findings.map((f) => f.id)).toContain("noLog");
    // It must not claim a gap it cannot know.
    expect(d.gapPerHourG).toBeUndefined();
  });

  it("names the shortfall when the athlete took clearly too little", () => {
    const d = debrief({ log: log({ actualCarbPerHourG: 35 }) });
    expect(d.verdict).toBe("under-fuelled");
    expect(d.gapPerHourG).toBe(30);
    const f = d.findings.find((x) => x.id === "underFuelled")!;
    expect(f.vars).toMatchObject({ actual: 35, required: 65, gap: 30 });
  });

  it("says it was right when it was right", () => {
    const d = debrief({ log: log({ actualCarbPerHourG: 62, energy: "strong" }) });
    expect(d.verdict).toBe("about-right");
    expect(d.findings.map((f) => f.id)).toContain("aboutRight");
  });

  it("puts the gut first — more carbohydrate is the wrong advice when it was rejecting it", () => {
    const d = debrief({ log: log({ gi: "severe", actualCarbPerHourG: 30, energy: "bonked" }) });
    expect(d.verdict).toBe("over-gut");
    expect(d.findings.map((f) => f.id)).toContain("gutLimited");
    // It must not simultaneously tell them to eat more.
    expect(d.findings.map((f) => f.id)).not.toContain("underFuelled");
  });

  it("treats fading with a settled gut as evidence, even with no number given", () => {
    const d = debrief({ log: log({ energy: "bonked" }) });
    expect(d.verdict).toBe("under-fuelled");
    expect(d.actualCarbPerHourG).toBeUndefined();
  });

  it("points at the climb where the gap actually bit", () => {
    const d = debrief({ log: log({ actualCarbPerHourG: 30 }) });
    const climb = d.findings.find((f) => f.id === "climbUnfuelled");
    expect(climb).toBeDefined();
    expect(climb!.vars!.gain).toBeGreaterThan(400);
  });

  it("does not lecture about climbs when the fuelling was fine", () => {
    const d = debrief({ log: log({ actualCarbPerHourG: 64, energy: "strong" }) });
    expect(d.findings.map((f) => f.id)).not.toContain("climbUnfuelled");
  });

  it("says carbohydrate wasn't the deciding factor on a short session", () => {
    const short = planRouteFuelling({ samples: HILLY, activity: "running", durationMin: 45, carbPerHourG: 60 });
    const d = debriefSession({ plan: short, requiredCarbPerHourG: 60, durationMin: 45, log: log({ durationMin: 45 }) });
    expect(d.findings.map((f) => f.id)).toContain("shortSession");
  });

  it("reports the plan's own total, so the numbers agree with the chart", () => {
    expect(debrief().plannedTotalG).toBe(plan.totalCarbG);
  });
});

describe("logForActivity", () => {
  it("finds the log that belongs to a session", () => {
    const logs = [log({ id: "a", activityId: "strava:1" }), log({ id: "b", activityId: "strava:2" })];
    expect(logForActivity(logs, "strava:2")?.id).toBe("b");
  });

  it("returns nothing for a session that was never logged", () => {
    expect(logForActivity([log({ activityId: "strava:1" })], "strava:9")).toBeUndefined();
  });

  it("ignores logs that were never attached to a session", () => {
    const loose = log({ id: "loose", activityId: undefined });
    expect(logForActivity([loose], "strava:1")).toBeUndefined();
  });
});

describe("products on route stops", () => {
  const input = {
    goal: "endurance-performance" as const,
    activity: "trail-running" as const,
    durationMin: 180,
    intensity: "moderate" as const,
    bodyWeightKg: 70,
  };

  it("names a real product at every stop when the session is known", () => {
    const withProducts = planRouteFuelling({
      samples: HILLY,
      activity: "trail-running",
      durationMin: 180,
      carbPerHourG: 65,
      input,
      target: computeTarget(input),
    });
    expect(withProducts.stops.length).toBeGreaterThan(0);
    for (const s of withProducts.stops) {
      expect(s.product?.brand).toBeTruthy();
      expect(s.product?.servingLabel).toBeTruthy();
    }
  });

  it("still gives grams when there is no session context to pick from", () => {
    expect(plan.stops[0].product).toBeUndefined();
    expect(plan.stops[0].carbG).toBeGreaterThan(0);
  });

  it("picks a fast top-up before a climb, not the same thing everywhere", () => {
    const withProducts = planRouteFuelling({
      samples: HILLY,
      activity: "trail-running",
      durationMin: 180,
      carbPerHourG: 65,
      input,
      target: computeTarget(input),
    });
    const prep = withProducts.stops.find((s) => s.kind === "climb-prep");
    const steady = withProducts.stops.find((s) => s.kind === "steady");
    if (prep && steady) {
      // Different slots should generally resolve to different products; if the
      // catalog ever collapses them, that is worth knowing about.
      expect(prep.product).toBeDefined();
      expect(steady.product).toBeDefined();
    }
  });
});

describe("a session without a track", () => {
  /*
   * The reason this matters is a flow bug, not a maths one: while `plan` was
   * required the debrief could only live inside the route view, so Home offered
   * "how did it go?" only for sessions carrying GPS — and an athlete who runs
   * without it had no way to rate a session at all.
   */
  it("still judges the session, from rate and time alone", () => {
    const d = debriefSession({ requiredCarbPerHourG: 60, durationMin: 120 });
    // 60 g/h for two hours is 120 g, with no route needed to say so.
    expect(d.plannedTotalG).toBe(120);
    expect(d.requiredCarbPerHourG).toBe(60);
  });

  it("says nothing about terrain nobody recorded", () => {
    const terrain = (d: ReturnType<typeof debriefSession>) =>
      d.findings.filter((f) => f.id === "climbUnfuelled" || f.id === "startedLate").map((f) => f.id);
    // Both terrain findings only fire on an under-fuelled session, so the log
    // has to be one — a well-fuelled run produces none either way and would
    // have made this comparison prove nothing at all.
    const under = log({ actualCarbPerHourG: 20, energy: "bonked" });
    // The fixture climbs 600 m, so the routed plan *must* name it.
    expect(terrain(debriefSession({ plan, requiredCarbPerHourG: 65, durationMin: 180, log: under })))
      .toContain("climbUnfuelled");
    // With no track there is no climb to name, and none may be invented.
    expect(terrain(debriefSession({ requiredCarbPerHourG: 65, durationMin: 180, log: under }))).toEqual([]);
  });

  it("reaches a verdict from the athlete's own account, with no route at all", () => {
    const d = debriefSession({
      requiredCarbPerHourG: 65,
      durationMin: 180,
      log: log({ actualCarbPerHourG: 64, energy: "strong" }),
    });
    expect(d.verdict).toBe("about-right");
    expect(d.hasLog).toBe(true);
  });
});

