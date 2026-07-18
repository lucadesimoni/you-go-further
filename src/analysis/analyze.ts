import { recommend } from "../engine";
import type { Activity as EngineActivity, Intensity } from "../engine";
import type { Activity, AthleteProfile, SportType } from "../model";
import { toHours } from "../model";

/** Map a normalized sport to the nutrition engine's activity vocabulary. */
const SPORT_TO_ENGINE: Record<SportType, EngineActivity> = {
  run: "running",
  "trail-run": "trail-running",
  ride: "cycling",
  swim: "swimming",
  triathlon: "triathlon",
  other: "running",
};

/** Fraction of max HR → session intensity. Falls back to duration when no HR. */
export function inferIntensity(activity: Activity, maxHr?: number): Intensity {
  const hrMax = activity.maxHr ?? maxHr;
  if (activity.avgHr && hrMax) {
    const frac = activity.avgHr / hrMax;
    if (frac >= 0.88) return "race";
    if (frac >= 0.8) return "hard";
    if (frac >= 0.7) return "moderate";
    return "easy";
  }
  // No HR: assume steady moderate work, easy for very long slow efforts.
  return activity.durationSec > 150 * 60 ? "easy" : "moderate";
}

/** Bridge a synced activity into a nutrition-engine input for a given goal. */
export function activityToAthleteInput(
  activity: Activity,
  profile: AthleteProfile,
  goal: Parameters<typeof recommend>[0]["goal"] = "endurance-performance",
) {
  return {
    goal,
    activity: SPORT_TO_ENGINE[activity.sport],
    durationMin: Math.round(activity.durationSec / 60),
    intensity: inferIntensity(activity, profile.maxHr),
    bodyWeightKg: profile.bodyWeightKg,
  } as const;
}

const INTENSITY_WEIGHT: Record<Intensity, number> = { easy: 0.55, moderate: 0.72, hard: 0.9, race: 1.05 };

/**
 * Session training load. Prefers a provider-supplied value; otherwise a simple
 * HR/intensity-weighted duration score (a TRIMP-style proxy).
 */
export function sessionLoad(activity: Activity, profile: AthleteProfile): number {
  if (typeof activity.trainingLoad === "number") return activity.trainingLoad;
  const min = activity.durationSec / 60;
  const hrMax = activity.maxHr ?? profile.maxHr;
  const frac = activity.avgHr && hrMax ? activity.avgHr / hrMax : INTENSITY_WEIGHT[inferIntensity(activity, profile.maxHr)];
  return Math.round(min * Math.min(1.1, Math.max(0.45, frac)));
}

export interface WeekBucket {
  /** ISO date (Mon) of the week start. */
  weekStart: string;
  sessions: number;
  durationHr: number;
  distanceKm: number;
  load: number;
}

function weekStart(iso: string): string {
  const d = new Date(iso);
  const day = (d.getUTCDay() + 6) % 7; // Mon = 0
  d.setUTCDate(d.getUTCDate() - day);
  d.setUTCHours(0, 0, 0, 0);
  return d.toISOString().slice(0, 10);
}

/** Group activities into weekly buckets, newest week last. */
export function weeklyBuckets(activities: Activity[], profile: AthleteProfile): WeekBucket[] {
  const map = new Map<string, WeekBucket>();
  for (const a of activities) {
    const key = weekStart(a.startTime);
    const b =
      map.get(key) ?? { weekStart: key, sessions: 0, durationHr: 0, distanceKm: 0, load: 0 };
    b.sessions += 1;
    b.durationHr += toHours(a.durationSec);
    b.distanceKm += (a.distanceM ?? 0) / 1000;
    b.load += sessionLoad(a, profile);
    map.set(key, b);
  }
  return [...map.values()]
    .map((b) => ({
      ...b,
      durationHr: Math.round(b.durationHr * 10) / 10,
      distanceKm: Math.round(b.distanceKm * 10) / 10,
    }))
    .sort((a, b) => a.weekStart.localeCompare(b.weekStart));
}

export type LoadStatus = "detraining" | "optimal" | "caution" | "high-risk";

export interface AcwrResult {
  acuteLoad: number;
  chronicWeeklyLoad: number;
  ratio: number;
  status: LoadStatus;
}

/** Acute (7 d) : chronic (28 d weekly avg) workload ratio. */
export function acwr(activities: Activity[], profile: AthleteProfile, now = new Date()): AcwrResult {
  const nowMs = now.getTime();
  const within = (days: number) =>
    activities.filter((a) => nowMs - Date.parse(a.startTime) <= days * 86_400_000 && Date.parse(a.startTime) <= nowMs);
  const acuteLoad = within(7).reduce((s, a) => s + sessionLoad(a, profile), 0);
  const chronicWeeklyLoad = within(28).reduce((s, a) => s + sessionLoad(a, profile), 0) / 4;
  const ratio = chronicWeeklyLoad > 0 ? acuteLoad / chronicWeeklyLoad : 0;
  let status: LoadStatus = "optimal";
  if (chronicWeeklyLoad === 0) status = "optimal";
  else if (ratio < 0.8) status = "detraining";
  else if (ratio <= 1.3) status = "optimal";
  else if (ratio <= 1.5) status = "caution";
  else status = "high-risk";
  return {
    acuteLoad: Math.round(acuteLoad),
    chronicWeeklyLoad: Math.round(chronicWeeklyLoad),
    ratio: Math.round(ratio * 100) / 100,
    status,
  };
}

export interface NutritionDemand {
  /** Sessions in the last 7 days that need in-session carbohydrate. */
  fueledSessions: number;
  totalSessions: number;
  /** Sum of during-session carbohydrate across the last 7 days (g). */
  weeklyDuringCarbG: number;
  /** Average carb/h across sessions that require fueling. */
  avgCarbPerHourG: number;
}

/** Aggregate the nutrition engine's output across a training week. */
export function nutritionDemand(
  activities: Activity[],
  profile: AthleteProfile,
  goal: Parameters<typeof recommend>[0]["goal"],
  now = new Date(),
): NutritionDemand {
  const week = activities.filter((a) => now.getTime() - Date.parse(a.startTime) <= 7 * 86_400_000);
  let weeklyDuringCarbG = 0;
  let fueledSessions = 0;
  let carbPerHourSum = 0;
  for (const a of week) {
    const rec = recommend(activityToAthleteInput(a, profile, goal));
    weeklyDuringCarbG += rec.target.carbTotalG;
    if (rec.target.carbPerHourG > 0) {
      fueledSessions++;
      carbPerHourSum += rec.target.carbPerHourG;
    }
  }
  return {
    fueledSessions,
    totalSessions: week.length,
    weeklyDuringCarbG: Math.round(weeklyDuringCarbG),
    avgCarbPerHourG: fueledSessions ? Math.round(carbPerHourSum / fueledSessions) : 0,
  };
}

export interface AnalysisReport {
  totalActivities: number;
  totalHours: number;
  totalDistanceKm: number;
  weeks: WeekBucket[];
  acwr: AcwrResult;
  nutrition: NutritionDemand;
}

/** One-shot analysis over a set of activities. */
export function analyze(
  activities: Activity[],
  profile: AthleteProfile,
  goal: Parameters<typeof recommend>[0]["goal"] = "endurance-performance",
  now = new Date(),
): AnalysisReport {
  return {
    totalActivities: activities.length,
    totalHours: Math.round(activities.reduce((s, a) => s + toHours(a.durationSec), 0) * 10) / 10,
    totalDistanceKm: Math.round(activities.reduce((s, a) => s + (a.distanceM ?? 0) / 1000, 0)),
    weeks: weeklyBuckets(activities, profile),
    acwr: acwr(activities, profile, now),
    nutrition: nutritionDemand(activities, profile, goal, now),
  };
}
