import type { Activity } from "../model";
import type { SwissEvent } from "../events/events";
import { eventCountdown } from "../events/events";

/**
 * A training plan for a named race.
 *
 * Picking a race and being handed only a fuelling plan answers the last
 * question first. The athlete's actual problem between now and September is
 * *the training*, and fuelling is one of the things that has to be trained —
 * which is exactly why this belongs here rather than in a separate app: a plan
 * that says "3 hours on Sunday" and a plan that says "3 hours on Sunday at
 * 90 g of carbohydrate an hour, with the products you will race with" are
 * different plans, and only the second one prepares a gut.
 *
 * **Three commitments shape it.**
 *
 * 1. **It starts from where the athlete is.** The first week is built from
 *    their own recent volume, read from synced sessions. A plan that opens at
 *    ten hours for somebody currently doing four is not ambitious, it is an
 *    injury — and it is the single most common failure of generated plans.
 *    With no synced history it says so and starts deliberately conservatively.
 * 2. **It progresses within a limit.** Volume rises about 8 % a week with
 *    every fourth week cut back, and no week ever jumps more than a tenth
 *    beyond the last. The ceiling is not decoration: the plan is generated,
 *    nobody is watching it, and the failure mode of an unbounded ramp is a
 *    stress fracture.
 * 3. **The fuelling is periodised with the training.** Carbohydrate per hour on
 *    the long day climbs from what the athlete tolerates now to the race rate,
 *    reaching it in the specific-preparation weeks so that race rate has been
 *    rehearsed — repeatedly, on tired legs — well before the day.
 *
 * It is a template built on mainstream endurance-coaching practice, not
 * individual coaching, and it says so on the surface that renders it. It does
 * not know about the athlete's injuries, their job, or the fact that they are
 * moving house in August.
 */

export type SessionKind = "rest" | "easy" | "quality" | "long" | "brick" | "race";

/** Why a session is in the week — an id, so each locale writes its own sentence. */
export type SessionFocusId =
  | "aerobicBase"
  | "gutTraining"
  | "raceRehearsal"
  | "threshold"
  | "hills"
  | "recovery"
  | "backToBack"
  | "openerLegs"
  | "raceDay";

export interface PlannedSession {
  /** 0 = Monday. */
  dayOffset: number;
  kind: SessionKind;
  durationMin: number;
  /**
   * Carbohydrate to practise in this session, g/h. Zero on the short easy days,
   * where eating is not the point and pretending otherwise trains nothing.
   */
  carbPerHourG: number;
  focusId: SessionFocusId;
}

/** What the week's fuelling is working on. */
export type FuelFocusId = "settleGut" | "buildRate" | "raceRate" | "holdRate" | "loadAndTaper" | "raceWeek";

export interface TrainingWeek {
  /** 1-based, counting from the first full week of the plan. */
  index: number;
  /** ISO date of that week's Monday. */
  startDate: string;
  /** Whole weeks between this week and the race. */
  weeksOut: number;
  phase: "base" | "build" | "peak" | "taper" | "raceWeek";
  /** Planned volume, hours. */
  hours: number;
  /** Every fourth week comes down, which is where the adaptation happens. */
  recovery: boolean;
  sessions: PlannedSession[];
  fuelFocusId: FuelFocusId;
  /** Carbohydrate rate the long session practises this week, g/h. */
  longRunCarbPerHourG: number;
}

export interface TrainingPlan {
  event: SwissEvent;
  weeks: TrainingWeek[];
  /** Weekly hours the plan started from, and where that number came from. */
  startHours: number;
  startSource: "measured" | "assumed";
  /** The biggest week in the plan. */
  peakHours: number;
  /** Longest single session, minutes — and what it is a share of. */
  peakLongMin: number;
  /** Race-day carbohydrate rate the whole build is rehearsing toward. */
  raceCarbPerHourG: number;
  /** Set when there is too little time to prepare properly. */
  tooShort?: boolean;
}

const DAY_MS = 86_400_000;
const round1 = (n: number) => Math.round(n * 10) / 10;

/** The Monday on or before a date, as ISO `YYYY-MM-DD`. */
export function mondayOf(dateIso: string): string {
  const d = new Date(`${dateIso.slice(0, 10)}T00:00:00Z`);
  const shift = (d.getUTCDay() + 6) % 7;
  return new Date(d.getTime() - shift * DAY_MS).toISOString().slice(0, 10);
}

/**
 * The athlete's current weekly training hours, from their own sessions.
 *
 * The median of recent full weeks rather than the mean: one three-week holiday
 * or one enormous week should not decide what the plan opens at, and the mean
 * lets either of them do exactly that.
 */
export function recentWeeklyHours(activities: Activity[], now = new Date(), weeks = 6): number | undefined {
  if (activities.length === 0) return undefined;
  const cutoff = now.getTime() - weeks * 7 * DAY_MS;
  const buckets = new Map<string, number>();
  for (const a of activities) {
    const t = Date.parse(a.startTime);
    if (!Number.isFinite(t) || t < cutoff || t > now.getTime()) continue;
    const key = mondayOf(new Date(t).toISOString());
    buckets.set(key, (buckets.get(key) ?? 0) + a.durationSec / 3600);
  }
  const values = [...buckets.values()].sort((a, b) => a - b);
  if (values.length === 0) return undefined;
  const mid = Math.floor(values.length / 2);
  const median = values.length % 2 ? values[mid] : (values[mid - 1] + values[mid]) / 2;
  return round1(median);
}

/** Weekly volume rise, and the cut-back every fourth week. */
const WEEKLY_GROWTH = 1.08;
const RECOVERY_FACTOR = 0.65;
const MAX_WEEKLY_JUMP = 1.1;
/** Nobody needs more than this for the races in the catalogue. */
const HOURS_CEILING = 18;
/** Where a plan starts when there is no synced history to read. */
const ASSUMED_START_HOURS = 4;
/** Below this many weeks there is no build worth the name. */
const MIN_USEFUL_WEEKS = 4;

export interface TrainingPlanInput {
  event: SwissEvent;
  /** Estimated finish time, minutes — the long run is a share of it. */
  estimatedMin: number;
  /** Race-day carbohydrate target, g/h — what the build rehearses toward. */
  raceCarbPerHourG: number;
  /** The athlete's synced sessions, for the starting volume. */
  activities?: Activity[];
  /** What they already tolerate per hour, if their logs say. */
  currentCarbPerHourG?: number;
  now?: Date;
}

/**
 * Which phase a week belongs to, counting back from the race.
 *
 * Race week is its own thing; the two before it are the taper; the four before
 * that are where the work is most like the race. Everything earlier is build,
 * and the first third is base.
 */
function phaseFor(weeksOut: number, totalWeeks: number): TrainingWeek["phase"] {
  if (weeksOut === 0) return "raceWeek";
  if (weeksOut <= 2) return "taper";
  if (weeksOut <= 6) return "peak";
  return weeksOut > totalWeeks * 0.66 ? "base" : "build";
}

const FUEL_FOCUS: Record<TrainingWeek["phase"], FuelFocusId> = {
  base: "settleGut",
  build: "buildRate",
  peak: "raceRate",
  taper: "loadAndTaper",
  raceWeek: "raceWeek",
};

/**
 * How long the long session should be, as a share of race duration.
 *
 * A marathon runner rehearses most of the race; an ultra runner cannot, and
 * should not try — the way to prepare for a hundred kilometres is repeated
 * long days, not one suicidal one. So the share falls as the race gets longer,
 * and above six hours the plan reaches for back-to-back weekends instead.
 */
export function longSessionShare(estimatedMin: number): number {
  if (estimatedMin <= 180) return 0.85;
  if (estimatedMin <= 300) return 0.7;
  if (estimatedMin <= 480) return 0.5;
  return 0.35;
}

/**
 * Build the plan.
 *
 * Deliberately week-shaped rather than day-shaped beyond the key sessions: a
 * generated plan that dictates all seven days is pretending to a precision it
 * does not have, and the first thing any athlete does is move a session.
 */
export function buildTrainingPlan(input: TrainingPlanInput): TrainingPlan {
  const now = input.now ?? new Date();
  const { event, estimatedMin, raceCarbPerHourG } = input;
  const countdown = eventCountdown(event, now);

  const measured = recentWeeklyHours(input.activities ?? [], now);
  const startHours = Math.min(HOURS_CEILING, measured ?? ASSUMED_START_HOURS);
  const startSource: TrainingPlan["startSource"] = measured !== undefined ? "measured" : "assumed";

  const firstMonday = mondayOf(new Date(now.getTime() + DAY_MS).toISOString());
  const raceMonday = mondayOf(event.date);
  const totalWeeks = Math.max(0, Math.round((Date.parse(raceMonday) - Date.parse(firstMonday)) / (7 * DAY_MS)));

  const weeks: TrainingWeek[] = [];
  /**
   * The trend the build follows. Kept separate from the week's actual hours
   * because a cut-back week must not cost the build its ground: growing from
   * the *reduced* figure meant three weeks up and one week down netted almost
   * nothing, and fifteen weeks moved an athlete from four hours to four and a
   * half. Recovery lowers the week, never the trend.
   */
  let baseline = startHours;
  let hours = startHours;
  let peakHours = startHours;
  let peakLongMin = 0;

  const targetLongMin = Math.round(estimatedMin * longSessionShare(estimatedMin));
  const startCarb = Math.min(input.currentCarbPerHourG ?? 60, raceCarbPerHourG);

  for (let i = 0; i <= totalWeeks; i++) {
    const weekStart = new Date(Date.parse(firstMonday) + i * 7 * DAY_MS).toISOString().slice(0, 10);
    const weeksOut = totalWeeks - i;
    const phase = phaseFor(weeksOut, Math.max(1, totalWeeks));
    // Every fourth week comes down. Recovery is when the training is absorbed;
    // a plan that only ever climbs is a plan that breaks somebody.
    const recovery = phase !== "taper" && phase !== "raceWeek" && i > 0 && (i + 1) % 4 === 0;

    if (phase === "taper") {
      // Off the peak the build actually reached, not off last week — the taper
      // is defined by what was trained, and reading it from a cut-back week put
      // the first taper week *above* the peak weeks before it.
      hours = peakHours * (weeksOut === 2 ? 0.7 : 0.5);
    } else if (phase === "raceWeek") {
      hours = peakHours * 0.3;
    } else {
      if (i > 0 && !recovery) {
        baseline = Math.min(HOURS_CEILING, baseline * WEEKLY_GROWTH, baseline * MAX_WEEKLY_JUMP);
      }
      hours = recovery ? baseline * RECOVERY_FACTOR : baseline;
      peakHours = Math.max(peakHours, hours);
    }

    // Gut training tracks the build: the race rate has to be rehearsed, not met
    // for the first time on the day.
    const buildProgress = totalWeeks <= 1 ? 1 : Math.min(1, i / Math.max(1, totalWeeks - 3));
    const longRunCarbPerHourG =
      phase === "raceWeek"
        ? raceCarbPerHourG
        : Math.round((startCarb + (raceCarbPerHourG - startCarb) * buildProgress) / 5) * 5;

    // The long session grows toward its target and comes back down in the taper.
    const longMin =
      phase === "raceWeek"
        ? 30
        : phase === "taper"
          ? Math.round(targetLongMin * (weeksOut === 2 ? 0.6 : 0.4))
          : Math.round(Math.min(targetLongMin, targetLongMin * (0.45 + 0.55 * buildProgress) * (recovery ? 0.7 : 1)));
    weeks.push({
      index: i + 1,
      startDate: weekStart,
      weeksOut,
      phase,
      hours: round1(hours),
      recovery,
      longRunCarbPerHourG,
      fuelFocusId: FUEL_FOCUS[phase],
      sessions: sessionsFor({ phase, hours, longMin, longRunCarbPerHourG, recovery, estimatedMin, event }),
    });
    // Read off the sessions that were actually generated. Taking it from the
    // target before the week's own cap applied had the plan claiming a 525
    // minute long day that appeared nowhere in it.
    for (const s of weeks[weeks.length - 1].sessions) {
      if (s.kind === "long") peakLongMin = Math.max(peakLongMin, s.durationMin);
    }
  }

  // Read off the weeks that were actually produced. Taking it from the build
  // trend meant a two-week taper plan announced "peaks at 7 h a week" while
  // every week in it was 3.5 h or less.
  const peakInPlan = weeks.reduce((max, w) => Math.max(max, w.hours), 0);

  return {
    event,
    weeks,
    startHours: round1(startHours),
    startSource,
    peakHours: round1(peakInPlan),
    peakLongMin,
    raceCarbPerHourG,
    ...(countdown.daysOut >= 0 && totalWeeks < MIN_USEFUL_WEEKS ? { tooShort: true } : {}),
  };
}

/**
 * The key sessions of a week.
 *
 * Only the ones worth naming. The rest of the week is the athlete's own, and a
 * generated plan that fills all seven days is claiming a precision it has not
 * earned.
 */
function sessionsFor(p: {
  phase: TrainingWeek["phase"];
  hours: number;
  longMin: number;
  longRunCarbPerHourG: number;
  recovery: boolean;
  estimatedMin: number;
  event: SwissEvent;
}): PlannedSession[] {
  if (p.phase === "raceWeek") {
    return [
      { dayOffset: 1, kind: "easy", durationMin: 40, carbPerHourG: 0, focusId: "recovery" },
      { dayOffset: 3, kind: "easy", durationMin: 30, carbPerHourG: 0, focusId: "openerLegs" },
      { dayOffset: 6, kind: "race", durationMin: Math.round(p.estimatedMin), carbPerHourG: p.longRunCarbPerHourG, focusId: "raceDay" },
    ];
  }

  const out: PlannedSession[] = [];
  const totalMin = p.hours * 60;
  // The long day first: it is the session the week is built around, and what is
  // left over decides how much midweek work fits.
  const longMin = Math.min(p.longMin, Math.round(totalMin * 0.55));

  out.push({
    dayOffset: 6,
    kind: "long",
    durationMin: longMin,
    carbPerHourG: p.longRunCarbPerHourG,
    // A taper is not where a gut gets trained — the work is done and the job
    // is to arrive fresh having rehearsed, so it holds the rate rather than
    // pushing it.
    focusId:
      p.phase === "peak" || p.phase === "taper"
        ? "raceRehearsal"
        : p.phase === "base"
          ? "aerobicBase"
          : "gutTraining",
  });

  // A second long day on the weekend is how an ultra is actually prepared for:
  // the point is running tired, which one enormous session does not teach.
  if (p.estimatedMin > 480 && (p.phase === "build" || p.phase === "peak") && !p.recovery) {
    out.push({
      dayOffset: 5,
      kind: "long",
      durationMin: Math.round(longMin * 0.6),
      carbPerHourG: p.longRunCarbPerHourG,
      focusId: "backToBack",
    });
  }

  if (!p.recovery && p.phase !== "base") {
    out.push({
      dayOffset: 2,
      kind: "quality",
      durationMin: Math.max(45, Math.round(totalMin * 0.18)),
      // Short and hard is not where a gut is trained; pretending it is teaches
      // nothing and upsets a session that had another job.
      carbPerHourG: 0,
      focusId: p.event.ascentM / Math.max(1, p.event.distanceKm) > 25 ? "hills" : "threshold",
    });
  }

  out.push({
    dayOffset: 3,
    kind: "easy",
    durationMin: Math.max(30, Math.round(totalMin * 0.15)),
    carbPerHourG: 0,
    focusId: p.recovery ? "recovery" : "aerobicBase",
  });
  out.push({ dayOffset: 0, kind: "rest", durationMin: 0, carbPerHourG: 0, focusId: "recovery" });

  return out.sort((a, b) => a.dayOffset - b.dayOffset);
}
