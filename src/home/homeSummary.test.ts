import { describe, it, expect } from "vitest";
import { dayPart, greetableName, longestRecent, recentSessions, shortcutsFor, weekSummary } from "./homeSummary";
import type { Activity } from "../model";

const NOW = new Date("2026-07-20T12:00:00.000Z");

const act = (daysAgo: number, over: Partial<Activity> = {}): Activity => ({
  id: `a${daysAgo}-${over.durationSec ?? 0}`,
  provider: "strava",
  externalId: `e${daysAgo}`,
  sport: "run",
  startTime: new Date(NOW.getTime() - daysAgo * 86_400_000).toISOString(),
  durationSec: 3600,
  distanceM: 10_000,
  elevationGainM: 100,
  ...over,
});

describe("dayPart", () => {
  it("splits the day the way an athlete would", () => {
    expect(dayPart(5)).toBe("morning"); // a dawn session is still morning
    expect(dayPart(11)).toBe("morning");
    expect(dayPart(12)).toBe("afternoon");
    expect(dayPart(17)).toBe("afternoon");
    expect(dayPart(18)).toBe("evening");
    expect(dayPart(23)).toBe("evening");
  });
});

describe("weekSummary", () => {
  it("counts the last seven days, not the calendar week", () => {
    // Six days ago is inside the window even though it may be "last week".
    const s = weekSummary([act(1), act(6), act(8)], NOW);
    expect(s.sessions).toBe(2);
  });

  it("totals hours, distance and climbing", () => {
    const s = weekSummary([act(1, { durationSec: 5400, distanceM: 15_000, elevationGainM: 250 }), act(2)], NOW);
    expect(s.hours).toBe(2.5); // 1.5 h + 1 h
    expect(s.distanceKm).toBe(25);
    expect(s.elevationM).toBe(350);
  });

  it("compares against the previous seven days", () => {
    const s = weekSummary([act(1), act(2), act(9)], NOW);
    // Two hours this week against one the week before.
    expect(s.deltaHours).toBe(1);
    expect(s.hasComparison).toBe(true);
  });

  it("says there is nothing to compare when the athlete is new", () => {
    const s = weekSummary([act(1)], NOW);
    expect(s.hasComparison).toBe(false);
    expect(s.deltaHours).toBe(1);
  });

  it("reports a quiet week honestly rather than hiding it", () => {
    const s = weekSummary([act(9), act(10)], NOW);
    expect(s.sessions).toBe(0);
    expect(s.hours).toBe(0);
    expect(s.deltaHours).toBe(-2);
  });

  it("ignores an unparseable timestamp instead of counting it as now", () => {
    const s = weekSummary([act(1), { ...act(2), startTime: "not a date" }], NOW);
    expect(s.sessions).toBe(1);
  });

  it("includes a session recorded slightly in the future (clock skew)", () => {
    const s = weekSummary([act(-0.2)], NOW);
    expect(s.sessions).toBe(1);
  });

  it("handles no activities at all", () => {
    const s = weekSummary([], NOW);
    expect(s).toMatchObject({ sessions: 0, hours: 0, distanceKm: 0, elevationM: 0, hasComparison: false });
  });
});

describe("recentSessions", () => {
  it("returns the newest first", () => {
    const list = recentSessions([act(5), act(1), act(3)]);
    expect(list.map((a) => a.startTime)).toEqual([act(1).startTime, act(3).startTime, act(5).startTime]);
  });

  it("limits the list", () => {
    expect(recentSessions([act(1), act(2), act(3), act(4)], 2)).toHaveLength(2);
  });

  it("does not mutate the caller's array", () => {
    const input = [act(5), act(1)];
    const copy = [...input];
    recentSessions(input);
    expect(input).toEqual(copy);
  });
});

describe("longestRecent", () => {
  it("finds the session that most needs a fuelling plan", () => {
    const long = act(2, { durationSec: 4 * 3600 });
    expect(longestRecent([act(1), long, act(3)], 7, NOW)).toBe(long);
  });

  it("ignores anything outside the window", () => {
    const old = act(20, { durationSec: 6 * 3600 });
    expect(longestRecent([act(1), old], 7, NOW)?.durationSec).toBe(3600);
  });

  it("returns null when there is nothing recent", () => {
    expect(longestRecent([act(30)], 7, NOW)).toBeNull();
    expect(longestRecent([], 7, NOW)).toBeNull();
  });
});

describe("shortcutsFor", () => {
  it("gives an athlete no staff shortcuts — their whole screen is already theirs", () => {
    expect(shortcutsFor("athlete")).toEqual([]);
  });

  it("gives a coach their squad", () => {
    expect(shortcutsFor("coach").map((s) => s.id)).toEqual(["team"]);
  });

  it("gives a nutritionist both the squad and the product library", () => {
    expect(shortcutsFor("nutritionist").map((s) => s.id)).toEqual(["team", "catalog"]);
  });

  it("gives an owner the platform, not a squad they don't coach", () => {
    expect(shortcutsFor("owner").map((s) => s.id)).toEqual(["catalog", "admin"]);
    expect(shortcutsFor("admin").map((s) => s.id)).toEqual(["catalog", "admin"]);
  });
});

describe("who the greeting is for", () => {
  /**
   * Email sign-in names the account after the address's local part when the
   * athlete leaves the optional name field empty. "Good morning, n.brunner" is
   * cold; "Good morning, probe-1786606483115" says the app has no idea who it
   * is talking to, in the largest text on the first screen.
   */
  it("greets a person by name", () => {
    expect(greetableName("Nina")).toBe("Nina");
    expect(greetableName("Nina Brunner")).toBe("Nina");
    expect(greetableName("  Léa  ")).toBe("Léa");
  });

  it("refuses to greet an email address or a machine string", () => {
    expect(greetableName("n.brunner")).toBeNull();
    expect(greetableName("probe-1786606483115")).toBeNull();
    expect(greetableName("nina99")).toBeNull();
    expect(greetableName("")).toBeNull();
    expect(greetableName("N")).toBeNull();
  });

  it("keeps a name-like local part, because that is still a name", () => {
    // "nina@club.ch" carries a real first name in front of the @; greeting her
    // "Good morning, nina" is friendly and true. The rule above is meant to
    // catch strings no one would answer to, not to be squeamish about where a
    // name came from.
    expect(greetableName("nina@club.ch")).toBe("nina");
  });
});
