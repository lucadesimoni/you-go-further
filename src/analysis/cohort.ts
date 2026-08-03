import type { SessionFeedback } from "../feedback";

/**
 * Learning across athletes — the half of "Millionen echter Entscheidungen" the
 * platform did not have.
 *
 * Until now the engine learned strictly *within* one athlete: their last eight
 * logs set their own carbohydrate ceiling. That is honest but slow, and it makes
 * every athlete pay their own tuition. Somebody has to be the first person to
 * find out that 100 g/h from gels alone goes badly — but only the first.
 *
 * This module pools outcomes into **rate bands** and reports how often each band
 * went wrong, with the sample size attached. Three rules keep it defensible:
 *
 * 1. **Nothing identifying goes in.** A cohort row is a rate band, a gut outcome
 *    and a count. There is no athlete id, no date, and no route.
 * 2. **Silence below a threshold.** With four logs in a band, the observed rate
 *    could be anything; the module says "not enough data" rather than dressing
 *    noise as a finding.
 * 3. **A Wilson interval, not a bare percentage.** "3 of 4 athletes" is not 75 %
 *    — the honest statement is "somewhere between 30 % and 95 %", and the width
 *    of that interval is what tells the reader how much to trust it.
 *
 * What it produces is a *prior*: what usually happens at this rate. The
 * athlete's own logs still win when they exist, because the population is not
 * their gut.
 */

/** Carbohydrate rate bands, in g/h. Chosen to straddle the transporter limits. */
export const RATE_BANDS = [
  { id: "under-40", min: 0, max: 40, label: "under 40 g/h" },
  { id: "40-60", min: 40, max: 60, label: "40–60 g/h" },
  { id: "60-80", min: 60, max: 80, label: "60–80 g/h" },
  { id: "80-100", min: 80, max: 100, label: "80–100 g/h" },
  { id: "over-100", min: 100, max: Infinity, label: "over 100 g/h" },
] as const;

export type RateBandId = (typeof RATE_BANDS)[number]["id"];

/** One anonymised outcome. This is the *only* shape that leaves an account. */
export interface CohortObservation {
  band: RateBandId;
  /** True when the athlete reported mild or severe gut distress. */
  gutDistress: boolean;
  /** True when they faded or bonked. */
  faded: boolean;
}

export interface BandStat {
  band: RateBandId;
  label: string;
  /** Sessions observed in this band. */
  n: number;
  /** Share reporting gut distress, 0–1. */
  distressRate: number;
  /** Wilson 95 % interval on that share — the honest version of the number. */
  low: number;
  high: number;
  /** Share that faded or bonked, 0–1. */
  fadeRate: number;
  /** False when `n` is too small to say anything. */
  reliable: boolean;
}

/** Below this, a band is noise rather than knowledge. */
export const MIN_BAND_SAMPLES = 12;

/** Which band a rate falls in. */
export function bandFor(carbPerHourG: number): RateBandId {
  const found = RATE_BANDS.find((b) => carbPerHourG >= b.min && carbPerHourG < b.max);
  return (found ?? RATE_BANDS[RATE_BANDS.length - 1]).id;
}

/**
 * Reduce a log to the anonymous outcome, or nothing.
 *
 * A log with no actual rate cannot be placed in a band — using the *planned*
 * rate instead would quietly record what we advised rather than what happened,
 * which is exactly the bias that would make the cohort agree with itself.
 */
export function observe(feedback: SessionFeedback): CohortObservation | null {
  if (feedback.actualCarbPerHourG === undefined) return null;
  return {
    band: bandFor(feedback.actualCarbPerHourG),
    gutDistress: feedback.gi === "mild" || feedback.gi === "severe",
    faded: feedback.energy === "bonked" || feedback.energy === "faded",
  };
}

/**
 * Wilson score interval for a proportion.
 *
 * The textbook normal-approximation interval is badly behaved exactly where this
 * data lives — small samples and proportions near zero — and will happily return
 * a negative lower bound. Wilson does not.
 */
export function wilson(successes: number, n: number, z = 1.96): { low: number; high: number } {
  if (n === 0) return { low: 0, high: 1 };
  const p = successes / n;
  const denom = 1 + (z * z) / n;
  const centre = p + (z * z) / (2 * n);
  const spread = z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n));
  return {
    low: Math.max(0, (centre - spread) / denom),
    high: Math.min(1, (centre + spread) / denom),
  };
}

/** Aggregate observations into per-band statistics. */
export function summariseBands(observations: CohortObservation[]): BandStat[] {
  return RATE_BANDS.map((b) => {
    const inBand = observations.filter((o) => o.band === b.id);
    const distress = inBand.filter((o) => o.gutDistress).length;
    const faded = inBand.filter((o) => o.faded).length;
    const n = inBand.length;
    const { low, high } = wilson(distress, n);
    return {
      band: b.id,
      label: b.label,
      n,
      distressRate: n ? Math.round((distress / n) * 100) / 100 : 0,
      low: Math.round(low * 100) / 100,
      high: Math.round(high * 100) / 100,
      fadeRate: n ? Math.round((faded / n) * 100) / 100 : 0,
      reliable: n >= MIN_BAND_SAMPLES,
    };
  });
}

export interface CohortPrior {
  band: RateBandId;
  label: string;
  /** Present only when the band has enough observations to speak. */
  distressRate?: number;
  low?: number;
  high?: number;
  n: number;
  /** What this means for the athlete about to try that rate. */
  text: string;
  /** True when the platform has enough data to make the statement at all. */
  known: boolean;
}

/**
 * What usually happens at a given rate.
 *
 * Deliberately phrased as frequency ("about 1 in 4 sessions"), which people read
 * far more accurately than a percentage, and always with the sample size — a
 * claim without an *n* is not a finding.
 */
export function cohortPrior(carbPerHourG: number, observations: CohortObservation[]): CohortPrior {
  const band = bandFor(carbPerHourG);
  const stat = summariseBands(observations).find((s) => s.band === band)!;
  if (!stat.reliable) {
    return {
      band,
      label: stat.label,
      n: stat.n,
      known: false,
      text: `Not enough logged sessions at ${stat.label} yet to say how it usually goes.`,
    };
  }
  const inHowMany = stat.distressRate > 0 ? Math.max(1, Math.round(1 / stat.distressRate)) : 0;
  const text =
    stat.distressRate === 0
      ? `No gut trouble reported at ${stat.label} across ${stat.n} logged sessions.`
      : `At ${stat.label}, about 1 session in ${inHowMany} came with gut trouble (${stat.n} logged).`;
  return {
    band,
    label: stat.label,
    n: stat.n,
    distressRate: stat.distressRate,
    low: stat.low,
    high: stat.high,
    known: true,
    text,
  };
}

/**
 * The highest band the population tolerates well, as a starting suggestion.
 *
 * Used only where an athlete has no logs of their own — a first plan should
 * begin from what usually works rather than from the middle of the range.
 */
export function wellToleratedCeilingG(observations: CohortObservation[], maxDistress = 0.2): number | undefined {
  const stats = summariseBands(observations).filter((s) => s.reliable);
  const ok = stats.filter((s) => s.distressRate <= maxDistress);
  if (ok.length === 0) return undefined;
  const bands = ok.map((s) => RATE_BANDS.find((b) => b.id === s.band)!);
  const best = bands.sort((a, b) => b.min - a.min)[0];
  return Number.isFinite(best.max) ? best.max : best.min;
}
