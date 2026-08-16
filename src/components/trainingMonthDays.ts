import type { Activity } from "../model";
import type { SessionFeedback } from "../feedback";
import { logForActivity } from "../analysis";

/**
 * The last five weeks, one entry per day, Monday first.
 *
 * Pure and separate from the component that draws it, because the interesting
 * part is the calendar arithmetic — week boundaries, a day with two sessions,
 * the days that have not happened yet — and none of that needs a browser to be
 * checked.
 *
 * Monday first is not a preference: it is the Swiss week, and it is the week
 * every training plan is written in.
 */
export type DayState = "none" | "trained" | "logged";

export interface MonthDay {
  date: Date;
  state: DayState;
  /** Later than today — drawn faintly so the grid keeps a month's shape. */
  future: boolean;
}

const DAY_MS = 24 * 60 * 60 * 1000;
export const MONTH_WEEKS = 5;

const dayKey = (d: Date) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;

export function monthDays(activities: Activity[], feedback: SessionFeedback[], today = new Date()): MonthDay[] {
  const end = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  // 0 = Sunday in JS, so shift it into a Monday-first week.
  const mondayOffset = (end.getDay() + 6) % 7;
  const thisMonday = new Date(end.getTime() - mondayOffset * DAY_MS);
  const start = new Date(thisMonday.getTime() - (MONTH_WEEKS - 1) * 7 * DAY_MS);

  const byDay = new Map<string, DayState>();
  for (const a of activities) {
    const key = dayKey(new Date(a.startTime));
    // One debrief is what the planner needs, not one per session — so a day
    // with two rides and a single log counts as logged, and stops asking.
    const state: DayState = logForActivity(feedback, a.id) ? "logged" : "trained";
    if (state === "logged" || !byDay.has(key)) byDay.set(key, state);
  }

  return Array.from({ length: MONTH_WEEKS * 7 }, (_, i) => {
    const date = new Date(start.getTime() + i * DAY_MS);
    return { date, state: byDay.get(dayKey(date)) ?? "none", future: date.getTime() > end.getTime() };
  });
}
