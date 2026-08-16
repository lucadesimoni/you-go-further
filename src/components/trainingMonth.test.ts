import { describe, expect, it } from "vitest";
import { monthDays } from "./trainingMonthDays";
import type { Activity } from "../model";
import type { SessionFeedback } from "../feedback";

const act = (iso: string, id: string): Activity => ({
  id,
  provider: "strava",
  externalId: id,
  sport: "run",
  startTime: iso,
  durationSec: 3600,
  distanceM: 10000,
  elevationGainM: 100,
});

const log = (activityId: string): SessionFeedback => ({
  id: `f-${activityId}`,
  activityId,
  date: "2026-08-12T10:00:00.000Z",
  gi: "none",
  energy: "strong",
  durationMin: 60,
  plannedCarbPerHourG: 60,
});

describe("the training month", () => {
  const today = new Date(2026, 7, 13); // Thursday 13 August 2026

  it("lays out five whole weeks, Monday first", () => {
    const days = monthDays([], [], today);
    expect(days).toHaveLength(35);
    expect(days[0].date.getDay()).toBe(1); // Monday
    expect(days[34].date.getDay()).toBe(0); // Sunday
    // The grid ends on the Sunday of the current week, so today is inside it.
    expect(days.some((d) => d.date.getDate() === 13 && d.date.getMonth() === 7)).toBe(true);
  });

  it("marks a day with a session, and a logged day differently", () => {
    const days = monthDays([act("2026-08-10T07:00:00.000Z", "a1"), act("2026-08-11T07:00:00.000Z", "a2")], [log("a2")], today);
    const byDate = (d: number) => days.find((x) => x.date.getDate() === d && x.date.getMonth() === 7)?.state;
    expect(byDate(10)).toBe("trained");
    expect(byDate(11)).toBe("logged");
    expect(byDate(12)).toBe("none");
  });

  it("counts a day as logged when any of its sessions was reviewed", () => {
    // Two sessions in one day, one debrief. The planner has what it needs, so
    // the day should not still be asking for a log.
    const days = monthDays(
      [act("2026-08-10T07:00:00.000Z", "morning"), act("2026-08-10T17:00:00.000Z", "evening")],
      [log("evening")],
      today,
    );
    expect(days.find((x) => x.date.getDate() === 10)?.state).toBe("logged");
  });

  it("knows which days have not happened yet", () => {
    const days = monthDays([], [], today);
    const future = days.filter((d) => d.future);
    // Thursday the 13th: Friday, Saturday and Sunday are still to come.
    expect(future).toHaveLength(3);
    expect(future.every((d) => d.date.getTime() > today.getTime())).toBe(true);
  });
});
