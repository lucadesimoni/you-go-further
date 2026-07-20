import type { Activity } from "../model";
import { toHours } from "../model";
import { levelForXp } from "./levels";

/**
 * Turns an athlete's data (activities, logged feedback, connected services) into
 * a gamification profile: XP, level, streaks, and achievement badges. Pure and
 * framework-free — the UI renders it; tests exercise it directly.
 */

export interface GamificationInput {
  activities: Activity[];
  feedbackCount: number;
  connectionsCount: number;
  now?: Date;
}

export interface Achievement {
  id: string;
  name: string;
  emoji: string;
  description: string;
  xp: number;
  unlocked: boolean;
}

export interface GamificationProfile {
  xp: number;
  level: number;
  levelName: string;
  xpIntoLevel: number;
  xpForLevel: number;
  streakDays: number;
  longestStreakDays: number;
  unlockedCount: number;
  achievements: Achievement[];
  stats: {
    activities: number;
    hours: number;
    distanceKm: number;
    elevationM: number;
  };
}

const XP_PER_ACTIVITY = 12;
const XP_PER_FEEDBACK = 20;
const XP_PER_CONNECTION = 30;

const dayKey = (iso: string) => iso.slice(0, 10);

/** Longest and current run of consecutive calendar days with an activity. */
function streaks(activities: Activity[]): { current: number; longest: number } {
  const days = [...new Set(activities.map((a) => dayKey(a.startTime)))].sort();
  if (days.length === 0) return { current: 0, longest: 0 };
  let longest = 1;
  let run = 1;
  for (let i = 1; i < days.length; i++) {
    const prev = Date.parse(days[i - 1]);
    const cur = Date.parse(days[i]);
    if (cur - prev === 86_400_000) run++;
    else run = 1;
    longest = Math.max(longest, run);
  }
  // Current run = consecutive days ending at the most recent activity day.
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
    const key = d.toISOString().slice(0, 10);
    byWeek.set(key, (byWeek.get(key) ?? 0) + toHours(a.durationSec));
  }
  return byWeek.size ? Math.max(...byWeek.values()) : 0;
}

/** Compute the full gamification profile. */
export function computeGamification(input: GamificationInput): GamificationProfile {
  const { activities, feedbackCount, connectionsCount } = input;
  const count = activities.length;
  const hours = activities.reduce((s, a) => s + toHours(a.durationSec), 0);
  const distanceKm = activities.reduce((s, a) => s + (a.distanceM ?? 0) / 1000, 0);
  const elevationM = activities.reduce((s, a) => s + (a.elevationGainM ?? 0), 0);
  const maxDistance = Math.max(0, ...activities.map((a) => a.distanceM ?? 0));
  const maxDuration = Math.max(0, ...activities.map((a) => a.durationSec));
  const { current, longest } = streaks(activities);
  const maxWeekHours = weeklyHoursMax(activities);

  const defs: Omit<Achievement, "unlocked">[] = [
    { id: "getting-started", name: "Getting started", emoji: "🏃", description: "Log your first activity", xp: 20 },
    { id: "consistent-7", name: "On a roll", emoji: "🔥", description: "A 7-day activity streak", xp: 60 },
    { id: "consistent-30", name: "Unstoppable", emoji: "🗓️", description: "A 30-day activity streak", xp: 200 },
    { id: "long-hauler", name: "Long hauler", emoji: "⏱️", description: "A single 3 h+ session", xp: 80 },
    { id: "centurion", name: "Centurion", emoji: "💯", description: "100 km in one session", xp: 150 },
    { id: "climber", name: "Climber", emoji: "⛰️", description: "5,000 m climbed in total", xp: 80 },
    { id: "big-week", name: "Big week", emoji: "📈", description: "10 h in a single week", xp: 100 },
    { id: "gut-trained", name: "Gut trained", emoji: "🧪", description: "Log 5 sessions in Log & learn", xp: 100 },
    { id: "fully-wired", name: "Fully wired", emoji: "🔗", description: "Connect all 4 services", xp: 120 },
    { id: "data-nerd", name: "Data nerd", emoji: "📊", description: "100 activities synced", xp: 150 },
  ];

  const met: Record<string, boolean> = {
    "getting-started": count >= 1,
    "consistent-7": longest >= 7,
    "consistent-30": longest >= 30,
    "long-hauler": maxDuration >= 3 * 3600,
    centurion: maxDistance >= 100_000,
    climber: elevationM >= 5000,
    "big-week": maxWeekHours >= 10,
    "gut-trained": feedbackCount >= 5,
    "fully-wired": connectionsCount >= 4,
    "data-nerd": count >= 100,
  };

  const achievements: Achievement[] = defs.map((d) => ({ ...d, unlocked: Boolean(met[d.id]) }));
  const achievementXp = achievements.filter((a) => a.unlocked).reduce((s, a) => s + a.xp, 0);
  const xp =
    count * XP_PER_ACTIVITY + feedbackCount * XP_PER_FEEDBACK + connectionsCount * XP_PER_CONNECTION + achievementXp;
  const lvl = levelForXp(xp);

  return {
    xp,
    level: lvl.level,
    levelName: lvl.levelName,
    xpIntoLevel: lvl.xpIntoLevel,
    xpForLevel: lvl.xpForLevel,
    streakDays: current,
    longestStreakDays: longest,
    unlockedCount: achievements.filter((a) => a.unlocked).length,
    achievements,
    stats: {
      activities: count,
      hours: Math.round(hours * 10) / 10,
      distanceKm: Math.round(distanceKm),
      elevationM: Math.round(elevationM),
    },
  };
}
