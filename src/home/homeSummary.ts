import type { Activity } from "../model";
import type { Role } from "../auth";
import type { TranslationKey } from "../i18n/en";

/**
 * What the start screen needs to answer "how am I doing, and what now?".
 *
 * Kept pure and separate from the component so the numbers can be tested
 * directly — a home screen that quietly miscounts the week is worse than no
 * home screen, because it is the first thing an athlete believes.
 */

export type DayPart = "morning" | "afternoon" | "evening";

/** Which greeting to use. Boundaries chosen so a 5 a.m. session is "morning". */
export function dayPart(hour: number): DayPart {
  if (hour < 12) return "morning";
  if (hour < 18) return "afternoon";
  return "evening";
}

export const GREETING_KEY: Record<DayPart, TranslationKey> = {
  morning: "home.goodMorning",
  afternoon: "home.goodAfternoon",
  evening: "home.goodEvening",
};

export interface WeekSummary {
  sessions: number;
  hours: number;
  distanceKm: number;
  elevationM: number;
  /** Change in hours against the previous seven days, e.g. +1.5 or −0.5. */
  deltaHours: number;
  /** True when there is a previous week to compare against at all. */
  hasComparison: boolean;
}

const HOURS = (sec: number) => Math.round((sec / 3600) * 10) / 10;

/**
 * The last seven days, and how they compare with the seven before.
 *
 * A rolling window rather than a calendar week: on a Tuesday, "this week" being
 * two sessions is discouraging and useless, whereas the last seven days is a
 * fair reading of current load.
 */
export function weekSummary(activities: Activity[], now = new Date()): WeekSummary {
  const day = 86_400_000;
  const from = now.getTime() - 7 * day;
  const prevFrom = now.getTime() - 14 * day;

  const inWindow = (a: Activity, lo: number, hi: number) => {
    const t = Date.parse(a.startTime);
    return Number.isFinite(t) && t >= lo && t < hi;
  };

  const week = activities.filter((a) => inWindow(a, from, now.getTime() + day));
  const prev = activities.filter((a) => inWindow(a, prevFrom, from));

  const sumSec = (xs: Activity[]) => xs.reduce((s, a) => s + a.durationSec, 0);
  const hours = HOURS(sumSec(week));

  return {
    sessions: week.length,
    hours,
    distanceKm: Math.round(week.reduce((s, a) => s + (a.distanceM ?? 0), 0) / 100) / 10,
    elevationM: Math.round(week.reduce((s, a) => s + (a.elevationGainM ?? 0), 0)),
    deltaHours: Math.round((hours - HOURS(sumSec(prev))) * 10) / 10,
    hasComparison: prev.length > 0,
  };
}

/** The most recent sessions, newest first. */
export function recentSessions(activities: Activity[], limit = 3): Activity[] {
  return [...activities]
    .sort((a, b) => Date.parse(b.startTime) - Date.parse(a.startTime))
    .slice(0, limit);
}

/**
 * The longest session in the coming-up window is the one that actually needs a
 * fuelling plan; on a home screen it is the most useful single session to name.
 */
export function longestRecent(activities: Activity[], days = 7, now = new Date()): Activity | null {
  const from = now.getTime() - days * 86_400_000;
  const recent = activities.filter((a) => Date.parse(a.startTime) >= from);
  if (recent.length === 0) return null;
  return recent.reduce((best, a) => (a.durationSec > best.durationSec ? a : best));
}

export interface Shortcut {
  /** Tab id to navigate to. */
  id: string;
  labelKey: TranslationKey;
  descriptionKey: TranslationKey;
}

/**
 * Role-relevant shortcuts.
 *
 * The start screen is for *every* signed-in user, not just athletes: a coach
 * opening the app wants their squad, an owner wants the platform. Everyone
 * still gets the athlete cards above these — staff train too.
 */
export function shortcutsFor(role: Role): Shortcut[] {
  const out: Shortcut[] = [];
  if (role === "coach" || role === "nutritionist") {
    out.push({ id: "team", labelKey: "home.shortcutTeam", descriptionKey: "home.shortcutTeamWhy" });
  }
  if (role === "nutritionist" || role === "admin" || role === "owner") {
    out.push({ id: "catalog", labelKey: "home.shortcutCatalog", descriptionKey: "home.shortcutCatalogWhy" });
  }
  if (role === "admin" || role === "owner") {
    out.push({ id: "admin", labelKey: "home.shortcutAdmin", descriptionKey: "home.shortcutAdminWhy" });
  }
  return out;
}
