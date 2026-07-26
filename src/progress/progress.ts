import type { Activity } from "../model";

/**
 * Progress — training consistency and **fuelling habits**, not a points game.
 *
 * There is no XP, no levels and no badges: milestones mark the behaviours that
 * actually make plans better (connecting real data, logging how sessions went so
 * the engine can learn, measuring your sweat rate, rehearsing long-session
 * fuelling). Each one says plainly why it matters.
 */
export interface ProgressInput {
  activities: Activity[];
  /** Sessions logged in the feedback loop — what the engine learns from. */
  feedbackCount: number;
  connectionsCount: number;
  /** Whether the athlete has entered a measured sweat rate. */
  hasMeasuredSweatRate?: boolean;
  /** Total services that can be connected (for the "all linked" milestone). */
  totalProviders?: number;
}

export type MilestoneCategory = "Your data" | "Fuelling" | "Consistency";

export interface Milestone {
  id: string;
  name: string;
  /** What it takes — and why it improves your fuelling. */
  description: string;
  category: MilestoneCategory;
  done: boolean;
}

export interface ProgressProfile {
  streakDays: number;
  longestStreakDays: number;
  doneCount: number;
  milestones: Milestone[];
  stats: {
    activities: number;
    hours: number;
    distanceKm: number;
    elevationM: number;
    /** Sessions long enough to need in-session carbohydrate (90 min+). */
    longSessions: number;
    loggedSessions: number;
  };
}

const toHours = (sec: number) => sec / 3600;
const dayKey = (iso: string) => iso.slice(0, 10);

/** Longest and current run of consecutive calendar days with an activity. */
function streaks(activities: Activity[]): { current: number; longest: number } {
  const days = [...new Set(activities.map((a) => dayKey(a.startTime)))].sort();
  if (days.length === 0) return { current: 0, longest: 0 };
  let longest = 1;
  let run = 1;
  for (let i = 1; i < days.length; i++) {
    if (Date.parse(days[i]) - Date.parse(days[i - 1]) === 86_400_000) run++;
    else run = 1;
    longest = Math.max(longest, run);
  }
  let current = 1;
  for (let i = days.length - 1; i > 0; i--) {
    if (Date.parse(days[i]) - Date.parse(days[i - 1]) === 86_400_000) current++;
    else break;
  }
  return { current, longest };
}

function weeklyHoursMax(activities: Activity[]): number {
  const byWeek = new Map<string, number>();
  for (const a of activities) {
    const d = new Date(a.startTime);
    const day = (d.getUTCDay() + 6) % 7;
    d.setUTCDate(d.getUTCDate() - day);
    byWeek.set(d.toISOString().slice(0, 10), (byWeek.get(d.toISOString().slice(0, 10)) ?? 0) + toHours(a.durationSec));
  }
  return byWeek.size ? Math.max(...byWeek.values()) : 0;
}

/** Training consistency plus the fuelling habits that sharpen your plans. */
export function computeProgress(input: ProgressInput): ProgressProfile {
  const { activities, feedbackCount, connectionsCount } = input;
  const totalProviders = input.totalProviders ?? 4;
  const hours = activities.reduce((s, a) => s + toHours(a.durationSec), 0);
  const distanceKm = activities.reduce((s, a) => s + (a.distanceM ?? 0) / 1000, 0);
  const elevationM = activities.reduce((s, a) => s + (a.elevationGainM ?? 0), 0);
  const longSessions = activities.filter((a) => a.durationSec >= 90 * 60).length;
  const maxDuration = Math.max(0, ...activities.map((a) => a.durationSec));
  const { current, longest } = streaks(activities);
  const maxWeekHours = weeklyHoursMax(activities);

  const milestones: Milestone[] = [
    {
      id: "connected",
      category: "Your data",
      name: "Training connected",
      description: "Link a service so plans use your real sessions instead of estimates.",
      done: connectionsCount >= 1,
    },
    {
      id: "connected-all",
      category: "Your data",
      name: "Full picture",
      description: `All ${totalProviders} services linked — every session and body signal feeds your plan.`,
      done: connectionsCount >= totalProviders,
    },
    {
      id: "sweat-measured",
      category: "Your data",
      name: "Sweat rate measured",
      description: "Hydration and sodium come from your own measurement, not a population average.",
      done: Boolean(input.hasMeasuredSweatRate),
    },
    {
      id: "first-log",
      category: "Fuelling",
      name: "First session logged",
      description: "Tell the planner how fuelling felt — that single habit is what it learns from.",
      done: feedbackCount >= 1,
    },
    {
      id: "learning",
      category: "Fuelling",
      name: "Learning loop running",
      description: "5 sessions logged: carb targets now adapt to your gut tolerance and energy.",
      done: feedbackCount >= 5,
    },
    {
      id: "dialled-in",
      category: "Fuelling",
      name: "Dialled in",
      description: "15 sessions logged — your carb ceiling is genuinely tuned to you.",
      done: feedbackCount >= 15,
    },
    {
      id: "fuelling-practice",
      category: "Fuelling",
      name: "Fuelling practice",
      description: "5 sessions over 90 minutes — the ones that actually need carbohydrate going in.",
      done: longSessions >= 5,
    },
    {
      id: "race-rehearsal",
      category: "Fuelling",
      name: "Race rehearsal",
      description: "A 3 h+ session: long enough to prove your race-day fuelling and train your gut.",
      done: maxDuration >= 3 * 3600,
    },
    {
      id: "consistent-week",
      category: "Consistency",
      name: "Consistent week",
      description: "7 days in a row — regular training is what makes fuelling worth optimising.",
      done: longest >= 7,
    },
    {
      id: "consistent-month",
      category: "Consistency",
      name: "Consistent month",
      description: "A 30-day run of training days — at this load, daily eating matters as much as session fuelling.",
      done: longest >= 30,
    },
    {
      id: "big-block",
      category: "Consistency",
      name: "Big block",
      description: "10 hours in a single week — high demand, so daily carbohydrate has to rise with it.",
      done: maxWeekHours >= 10,
    },
  ];

  return {
    streakDays: current,
    longestStreakDays: longest,
    doneCount: milestones.filter((m) => m.done).length,
    milestones,
    stats: {
      activities: activities.length,
      hours: Math.round(hours * 10) / 10,
      distanceKm: Math.round(distanceKm),
      elevationM: Math.round(elevationM),
      longSessions,
      loggedSessions: feedbackCount,
    },
  };
}
