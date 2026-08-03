import type { Activity } from "../model";
import type { AthleteProfile } from "../users";
import { sessionLoad } from "./analyze";

/**
 * Training-load analytics — the crunching that turns a pile of sessions into the
 * three questions an endurance athlete actually asks: *am I getting fitter, am I
 * digging a hole, and am I fresh enough to race?*
 *
 * The platform already had acute:chronic ratio, which is a single number and a
 * blunt one. This adds the standard toolkit around it, all computed from the same
 * per-session load so nothing can disagree:
 *
 * - **Fitness / fatigue / form** — exponentially weighted moving averages over 42
 *   and 7 days, the Banister-derived model everything from TrainingPeaks to
 *   intervals.icu uses. Form is fitness minus fatigue: negative means loaded,
 *   positive means rested.
 * - **Monotony and strain** (Foster 1998) — how *samey* a week is. Seven identical
 *   days at moderate load are harder to absorb than five hard days and two rest
 *   days at the same total, and monotony is what catches that.
 * - **Ramp rate** — how fast the chronic load is climbing. The number that
 *   precedes most overuse injuries.
 *
 * Why this belongs to a nutrition platform: every one of these changes what the
 * athlete should eat. Fatigue high and form deep negative means recovery
 * carbohydrate and protein matter more than the session plan; a hard ramp means
 * the weekly carbohydrate floor has moved.
 */

export interface LoadPoint {
  /** ISO date, midnight — one point per day, including rest days. */
  date: string;
  /** Sum of session loads that day (0 on a rest day). */
  load: number;
  /** Exponentially weighted 42-day average — "fitness". */
  fitness: number;
  /** Exponentially weighted 7-day average — "fatigue". */
  fatigue: number;
  /** Fitness minus fatigue — "form". Negative while loading. */
  form: number;
}

export type LoadTrend = "building" | "steady" | "tapering" | "detraining";

export interface LoadProfile {
  /** Daily series, oldest first. Empty when there is nothing to compute from. */
  series: LoadPoint[];
  fitness: number;
  fatigue: number;
  form: number;
  trend: LoadTrend;
  /**
   * Week-over-week change in fitness, as a percentage. Above ~10 %/week is the
   * band where overuse injuries cluster.
   */
  rampPct: number;
  /** Foster monotony for the last 7 days: mean daily load ÷ its standard deviation. */
  monotony: number;
  /** Weekly load × monotony. High strain is where illness and injury show up. */
  strain: number;
  /** Days with any session in the last 7. */
  activeDays: number;
  /** True when there is enough history for the numbers to mean anything. */
  reliable: boolean;
}

const DAY_MS = 86_400_000;
const round1 = (n: number) => Math.round(n * 10) / 10;

/** Midnight UTC for a timestamp, as an ISO date string. */
function dayKey(iso: string): string {
  return new Date(iso).toISOString().slice(0, 10);
}

/**
 * Daily load totals across the whole window, rest days included.
 *
 * Rest days must be present as zeros: an EWMA over "only the days you trained"
 * would make a fortnight off look like peak fitness.
 */
export function dailyLoads(
  activities: Activity[],
  profile: AthleteProfile,
  now = new Date(),
): { date: string; load: number }[] {
  if (activities.length === 0) return [];
  const byDay = new Map<string, number>();
  for (const a of activities) {
    const key = dayKey(a.startTime);
    byDay.set(key, (byDay.get(key) ?? 0) + sessionLoad(a, profile));
  }
  const first = [...byDay.keys()].sort()[0];
  const start = Date.parse(`${first}T00:00:00.000Z`);
  const end = Date.parse(`${now.toISOString().slice(0, 10)}T00:00:00.000Z`);
  const out: { date: string; load: number }[] = [];
  for (let t = start; t <= end; t += DAY_MS) {
    const key = new Date(t).toISOString().slice(0, 10);
    out.push({ date: key, load: Math.round(byDay.get(key) ?? 0) });
  }
  return out;
}

/** Standard deviation of a sample (population form — this is the whole week). */
function stdDev(values: number[]): number {
  if (values.length === 0) return 0;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const variance = values.reduce((sum, v) => sum + (v - mean) ** 2, 0) / values.length;
  return Math.sqrt(variance);
}

/**
 * Foster's monotony: how evenly load is spread across a week.
 *
 * A week of identical moderate days scores high; the same total split into hard
 * days and true rest scores low. Above ~2.0 is the range associated with
 * staleness and illness — the athlete is never fully recovering.
 */
export function monotony(weekLoads: number[]): number {
  const sd = stdDev(weekLoads);
  const mean = weekLoads.reduce((a, b) => a + b, 0) / (weekLoads.length || 1);
  if (mean === 0) return 0;
  // A week with genuinely identical days has zero deviation; report the mean
  // itself rather than dividing by zero and calling it infinite.
  if (sd === 0) return round1(mean > 0 ? 3 : 0);
  return round1(mean / sd);
}

/** Compute the whole load profile. */
export function loadProfile(activities: Activity[], profile: AthleteProfile, now = new Date()): LoadProfile {
  const daily = dailyLoads(activities, profile, now);
  const empty: LoadProfile = {
    series: [],
    fitness: 0,
    fatigue: 0,
    form: 0,
    trend: "detraining",
    rampPct: 0,
    monotony: 0,
    strain: 0,
    activeDays: 0,
    reliable: false,
  };
  if (daily.length === 0) return empty;

  // Standard smoothing constants: 42 days for fitness, 7 for fatigue.
  const kFit = 2 / (42 + 1);
  const kFat = 2 / (7 + 1);
  let fitness = 0;
  let fatigue = 0;
  const series: LoadPoint[] = daily.map(({ date, load }) => {
    fitness = fitness + kFit * (load - fitness);
    fatigue = fatigue + kFat * (load - fatigue);
    return {
      date,
      load,
      fitness: round1(fitness),
      fatigue: round1(fatigue),
      form: round1(fitness - fatigue),
    };
  });

  const last = series[series.length - 1];
  const week = daily.slice(-7).map((d) => d.load);
  const weekTotal = week.reduce((a, b) => a + b, 0);
  const mono = monotony(week);

  // Ramp: fitness now vs. a week ago, as a percentage of the earlier value.
  const weekAgo = series[series.length - 8]?.fitness ?? 0;
  const rampPct = weekAgo > 0 ? Math.round(((last.fitness - weekAgo) / weekAgo) * 100) : 0;

  // Form is the clearest signal of what phase the athlete is in.
  const trend: LoadTrend =
    last.fitness < 5 ? "detraining" : last.form <= -10 ? "building" : last.form >= 10 ? "tapering" : "steady";

  return {
    series,
    fitness: last.fitness,
    fatigue: last.fatigue,
    form: last.form,
    trend,
    rampPct,
    monotony: mono,
    strain: Math.round(weekTotal * mono),
    activeDays: week.filter((l) => l > 0).length,
    // Under three weeks, a 42-day average is mostly warm-up and says little.
    reliable: daily.length >= 21,
  };
}

export interface LoadFlag {
  id: "rampTooFast" | "highMonotony" | "deepFatigue" | "detraining" | "wellRested";
  severity: "info" | "watch" | "act";
  text: string;
}

/**
 * What the numbers mean, in words, and only when they mean something.
 *
 * Each flag names the figure that produced it — a warning an athlete cannot
 * trace back to a number is one they will learn to ignore.
 */
export function loadFlags(p: LoadProfile): LoadFlag[] {
  const flags: LoadFlag[] = [];
  if (!p.reliable) return flags;

  if (p.rampPct > 10) {
    flags.push({
      id: "rampTooFast",
      severity: p.rampPct > 25 ? "act" : "watch",
      text: `Your load is climbing ${p.rampPct}% a week. Above ~10% is where overuse injuries cluster — hold this volume for a week before adding more, and keep carbohydrate up to match it.`,
    });
  }
  if (p.monotony >= 2 && p.activeDays >= 6) {
    flags.push({
      id: "highMonotony",
      severity: "watch",
      text: `Every day looks the same (monotony ${p.monotony}). Hard days need easy days around them — one genuine rest day does more for adaptation than another moderate one.`,
    });
  }
  if (p.form <= -30) {
    flags.push({
      id: "deepFatigue",
      severity: "act",
      text: `Fatigue is well ahead of fitness (form ${p.form}). This is where recovery fuelling stops being optional: carbohydrate and protein within the hour after every session.`,
    });
  }
  if (p.form >= 15 && p.fitness >= 20) {
    flags.push({
      id: "wellRested",
      severity: "info",
      text: `Fresh, with fitness intact (form +${p.form}). A good week to race, or to rehearse race fuelling at full rate.`,
    });
  }
  if (p.trend === "detraining" && p.fitness > 0) {
    flags.push({
      id: "detraining",
      severity: "info",
      text: "Load has dropped away. Ease back in rather than picking up where you left off.",
    });
  }
  return flags;
}
