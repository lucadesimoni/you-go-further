import { buildSchedule, computeTarget, recommend, type AthleteInput, type Activity as EngineActivity } from "../engine";
import { deriveAdaptation, toAdaptation, type SessionFeedback } from "../feedback";
import type { Activity } from "../model";
import type { SwissEvent } from "../events/events";
import { longestRecentMin } from "../events/events";
import type { PlannedSession, SessionKind, TrainingPlan } from "./plan";

/**
 * Fuelling for every session of the build — before, during and after — plus
 * what the athlete's own logs say about how it is going.
 *
 * A training plan that names a duration and a carbohydrate rate stops one step
 * short. "3 hours on Sunday at 90 g/h" still leaves the athlete to work out
 * what to eat beforehand, how many feeds that is, and what to take afterwards —
 * and the answer differs for every session in the plan, because a 45-minute
 * easy run and a four-hour rehearsal are not the same problem.
 *
 * Every number here comes from the same engine the session planner uses. That
 * is deliberate: a second dosing model living in the training module would
 * eventually disagree with the first, and the athlete would be told two things.
 * The one exception is the *during* carbohydrate rate on a long session, which
 * comes from the plan rather than the engine — the whole point of periodising
 * gut training is that the rate is deliberately below race rate early on, and
 * an engine that only knows about today would overwrite that progression.
 */

/** How hard each kind of session is, for the engine's dosing. */
const INTENSITY: Record<SessionKind, AthleteInput["intensity"]> = {
  rest: "easy",
  easy: "easy",
  quality: "hard",
  long: "moderate",
  brick: "moderate",
  race: "race",
};

/** What the athlete is doing, from the race they are training for. */
function activityFor(event: SwissEvent): EngineActivity {
  switch (event.discipline) {
    case "cycling":
      return "cycling";
    case "triathlon":
      return "triathlon";
    case "road-run":
      return "running";
    default:
      return "trail-running";
  }
}

export interface FuellingContext {
  event: SwissEvent;
  bodyWeightKg: number;
  sweatLevel?: AthleteInput["sweatLevel"];
  caffeineOk?: boolean;
  conditions?: AthleteInput["conditions"];
  /** The athlete's session logs, so the engine applies what it has learned. */
  feedback?: SessionFeedback[];
}

export interface SessionFuelling {
  /** Before the session: carbohydrate, and the fluid to arrive topped up on. */
  pre: { carbG: number; fluidMl: number };
  during: {
    carbPerHourG: number;
    totalCarbG: number;
    fluidPerHourMl: number;
    sodiumPerLitreMg: number;
    /** How many times the athlete actually has to eat. */
    feeds: number;
    /**
     * The gut-training rate the plan set for this session, or 0 when it set
     * none. On a long day this is what the athlete is rehearsing; elsewhere the
     * rate above is simply what the session needs.
     */
    rehearsalRateG: number;
  };
  after: { carbG: number; proteinG: number };
  /** The session as the planner would take it, for "plan this session". */
  input: AthleteInput;
}

/**
 * Pre / during / after for one planned session.
 *
 * `pre` and `after` scale with body mass and with how demanding the session is,
 * which is why a recovery jog does not get a race breakfast. Fluid comes from
 * the athlete's sweat profile, not from the session length.
 */
export function sessionFuelling(session: PlannedSession, ctx: FuellingContext): SessionFuelling {
  const insight = deriveAdaptation(ctx.feedback ?? []);
  const input: AthleteInput = {
    goal: "race-preparation",
    activity: activityFor(ctx.event),
    durationMin: Math.max(20, session.durationMin),
    intensity: INTENSITY[session.kind],
    bodyWeightKg: ctx.bodyWeightKg,
    ...(ctx.conditions ? { conditions: ctx.conditions } : {}),
    ...(ctx.sweatLevel ? { sweatLevel: ctx.sweatLevel } : {}),
    ...(ctx.caffeineOk !== undefined ? { caffeineOk: ctx.caffeineOk } : {}),
    ...(insight.samples > 0 ? { adaptation: toAdaptation(insight) } : {}),
  };

  const rec = recommend(input);
  const target = computeTarget(input);
  const phase = (name: string) => rec.phases.find((p) => p.phase === name);

  /**
   * Who decides the rate depends on what the session is for.
   *
   * On a **long or race** day the plan wins. That is the gut-training
   * progression, and it is deliberately below what today alone would need in
   * the early weeks — an engine that only knows about today would overwrite the
   * ramp and the athlete would arrive at race rate untrained.
   *
   * Everywhere else the plan sets no rehearsal target, and the engine's
   * requirement applies. Reading the plan's zero as "eat nothing" left a
   * 93-minute threshold session unfuelled, which is not what "the gut is not
   * trained here" meant.
   */
  const rehearsal = session.kind === "long" || session.kind === "race" ? session.carbPerHourG : 0;
  const carbPerHourG = rehearsal > 0 ? rehearsal : target.carbPerHourG;
  const schedule = buildSchedule({ ...input, durationMin: input.durationMin });
  const hours = input.durationMin / 60;

  return {
    pre: {
      carbG: phase("pre")?.values.carbG ?? 0,
      // The standard pre-session top-up: 5–7 ml per kg in the two hours before.
      fluidMl: Math.round(ctx.bodyWeightKg * 6),
    },
    during: {
      carbPerHourG,
      totalCarbG: Math.round(carbPerHourG * hours),
      fluidPerHourMl: target.fluidPerHourMl,
      sodiumPerLitreMg: target.sodiumPerLitreMg,
      feeds: schedule.cues.filter((c) => (c.carbG ?? 0) > 0).length,
      rehearsalRateG: rehearsal,
    },
    after: {
      carbG: phase("post")?.values.carbG ?? 0,
      proteinG: phase("post")?.values.proteinG ?? 0,
    },
    input,
  };
}

// --- What the whole preparation adds up to ---------------------------------

export interface PrepStats {
  /** Sessions the plan actually asks for, rest days excluded. */
  sessions: number;
  hours: number;
  longSessions: number;
  /** Long sessions that rehearse the full race rate — the ones that count. */
  sessionsAtRaceRate: number;
  /** Carbohydrate to be practised in-session across the whole build, grams. */
  carbToPractiseG: number;
  /** Weeks until the plan first reaches race rate. */
  weeksToRaceRate?: number;
  /** Longest session at full race rate, minutes. */
  longestAtRaceRateMin: number;
}

export function prepStats(plan: TrainingPlan): PrepStats {
  let sessions = 0;
  let hours = 0;
  let longSessions = 0;
  let sessionsAtRaceRate = 0;
  let carbToPractiseG = 0;
  let longestAtRaceRateMin = 0;
  let weeksToRaceRate: number | undefined;

  for (const w of plan.weeks) {
    hours += w.hours;
    if (weeksToRaceRate === undefined && w.longRunCarbPerHourG >= plan.raceCarbPerHourG) {
      weeksToRaceRate = w.index;
    }
    for (const s of w.sessions) {
      if (s.kind === "rest") continue;
      sessions++;
      carbToPractiseG += (s.carbPerHourG * s.durationMin) / 60;
      if (s.kind !== "long" && s.kind !== "race") continue;
      longSessions++;
      // Race day itself is the exam, not the rehearsal.
      if (s.kind === "long" && s.carbPerHourG >= plan.raceCarbPerHourG) {
        sessionsAtRaceRate++;
        longestAtRaceRateMin = Math.max(longestAtRaceRateMin, s.durationMin);
      }
    }
  }

  return {
    sessions,
    hours: Math.round(hours * 10) / 10,
    longSessions,
    sessionsAtRaceRate,
    carbToPractiseG: Math.round(carbToPractiseG),
    ...(weeksToRaceRate !== undefined ? { weeksToRaceRate } : {}),
    longestAtRaceRateMin,
  };
}

// --- What the athlete's own data says about it ------------------------------

export type LearningId =
  | "noLogsYet"
  | "gutCeilingBelowTarget"
  | "toleratesRate"
  | "belowTargetSoFar"
  | "underFuelling"
  | "fewRaceRateSessions"
  | "longRunGap"
  | "practiseProducts"
  | "rateStepLarge";

export interface Learning {
  id: LearningId;
  severity: "info" | "act";
  values: Record<string, number>;
}

/** A rate rise per week bigger than this is more than a gut usually takes. */
export const MAX_COMFORTABLE_RATE_STEP = 12;
/** Fewer full-rate rehearsals than this and race day is the first one. */
const MIN_RACE_RATE_SESSIONS = 3;

/**
 * What this athlete, specifically, should take from the plan.
 *
 * Every item is derived from something real — their logged sessions, their
 * synced training, or an arithmetic property of the plan itself. Nothing here
 * is generic advice dressed as personalisation: if there is no data, the first
 * item says so and asks for a log rather than inventing an insight.
 */
export function planLearnings(
  plan: TrainingPlan,
  stats: PrepStats,
  opts: { feedback?: SessionFeedback[]; activities?: Activity[]; estimatedMin: number; now?: Date } = {
    estimatedMin: 0,
  },
): Learning[] {
  const out: Learning[] = [];
  const feedback = opts.feedback ?? [];
  const insight = deriveAdaptation(feedback);

  if (insight.samples === 0) {
    out.push({ id: "noLogsYet", severity: "act", values: { rate: plan.raceCarbPerHourG } });
  } else {
    // A ceiling the athlete's own gut has demonstrated beats the target the
    // race arithmetic wants. Saying "aim for 90" to somebody whose logs show
    // distress at 65 is how a plan loses an athlete's trust.
    if (insight.carbCeilingG !== undefined && insight.carbCeilingG < plan.raceCarbPerHourG) {
      out.push({
        id: "gutCeilingBelowTarget",
        severity: "act",
        values: { ceiling: insight.carbCeilingG, target: plan.raceCarbPerHourG, samples: insight.samples },
      });
    } else {
      /**
       * Report the rate their sessions actually show, not the one the race
       * wants. Reading the target back to the athlete as though it were their
       * own data — "your logs already show 105 g/h" to somebody whose best
       * logged session was 72 — is precisely the invented personalisation this
       * whole list is meant to avoid.
       */
      const best = Math.max(
        0,
        ...feedback.map((f) => f.actualCarbPerHourG ?? f.plannedCarbPerHourG ?? 0),
      );
      if (best >= plan.raceCarbPerHourG) {
        out.push({ id: "toleratesRate", severity: "info", values: { rate: best, samples: insight.samples } });
      } else {
        out.push({
          id: "belowTargetSoFar",
          severity: "info",
          values: { best, target: plan.raceCarbPerHourG, samples: insight.samples },
        });
      }
    }
    if ((insight.carbBiasG ?? 0) > 0) {
      out.push({ id: "underFuelling", severity: "act", values: { bias: insight.carbBiasG as number } });
    }
  }

  // How many chances are left to rehearse the real thing.
  if (stats.sessionsAtRaceRate < MIN_RACE_RATE_SESSIONS) {
    out.push({
      id: "fewRaceRateSessions",
      severity: stats.sessionsAtRaceRate === 0 ? "act" : "info",
      values: { sessions: stats.sessionsAtRaceRate, want: MIN_RACE_RATE_SESSIONS },
    });
  }

  // The jump from what they are doing to what the plan's longest day asks.
  const longestMin = Math.round(longestRecentMin(opts.activities ?? [], opts.now ?? new Date()));
  if (longestMin > 0 && plan.peakLongMin > longestMin * 1.5) {
    out.push({
      id: "longRunGap",
      severity: "info",
      values: { longest: longestMin, peak: plan.peakLongMin },
    });
  }

  // Does the plan itself ask the gut to climb faster than it usually goes?
  let biggestStep = 0;
  for (const [i, w] of plan.weeks.entries()) {
    if (i === 0) continue;
    biggestStep = Math.max(biggestStep, w.longRunCarbPerHourG - plan.weeks[i - 1].longRunCarbPerHourG);
  }
  if (biggestStep > MAX_COMFORTABLE_RATE_STEP) {
    out.push({ id: "rateStepLarge", severity: "info", values: { step: biggestStep } });
  }

  // True for everyone, and the one athletes skip: the products matter as much
  // as the grams, and the day is the wrong time to discover a flavour.
  out.push({ id: "practiseProducts", severity: "info", values: { sessions: stats.longSessions } });

  return out;
}
