import { describe, expect, it } from "vitest";
import type { Activity } from "../model";
import { SWISS_EVENTS, eventById, upcomingEvents } from "./catalogue";
import { carryLegs, enduranceRatio, eventAdvice, eventCountdown, longestRecentMin, type SwissEvent } from "./events";

const JUNGFRAU = eventById("jungfrau-marathon") as SwissEvent;

/** A race with stations, which the curated list deliberately does not invent. */
const withStations: SwissEvent = {
  ...JUNGFRAU,
  id: "test-with-stations",
  distanceKm: 40,
  aidStations: [
    { atKm: 10, name: "Zweilütschinen", water: true, sportsDrink: true, food: false },
    { atKm: 25, name: "Wengen", water: true, sportsDrink: true, food: true },
  ],
};

const at = (iso: string) => new Date(`${iso}T08:00:00Z`);
const race = (date: string): SwissEvent => ({ ...JUNGFRAU, date });

describe("event countdown", () => {
  it("names the phase from the number of days out", () => {
    const cases: [string, string][] = [
      ["2026-09-12", "raceDay"],
      ["2026-09-09", "raceWeek"],
      ["2026-09-01", "taper"],
      ["2026-08-10", "build"],
      ["2026-05-01", "base"],
      ["2026-09-13", "done"],
    ];
    for (const [today, phase] of cases) {
      expect(eventCountdown(race("2026-09-12"), at(today)).phase, today).toBe(phase);
    }
  });

  it("counts whole days regardless of the hour", () => {
    // Late-evening use is the normal case and must not lose a day.
    const late = eventCountdown(race("2026-09-12"), new Date("2026-09-10T23:45:00Z"));
    const early = eventCountdown(race("2026-09-12"), new Date("2026-09-10T00:05:00Z"));
    expect(late.daysOut).toBe(2);
    expect(early.daysOut).toBe(2);
  });

  it("treats a past race as done rather than as a negative countdown phase", () => {
    const c = eventCountdown(race("2026-09-12"), at("2026-10-01"));
    expect(c.phase).toBe("done");
    expect(c.isToday).toBe(false);
  });
});

describe("event advice", () => {
  const adviceOn = (today: string, event = race("2026-09-12")) =>
    eventAdvice(event, eventCountdown(event, at(today)), 70, 80).map((a) => a.id);

  it("only opens the carbohydrate-loading window inside 48 hours", () => {
    // The protocol is 36–48 h. Telling someone to load on Monday for a Saturday
    // race is both wrong and, over a week, quite a lot of unnecessary food.
    expect(adviceOn("2026-09-07")).not.toContain("carbLoad");
    expect(adviceOn("2026-09-11")).toContain("carbLoad");
  });

  it("scales the loading target with body mass", () => {
    const e = race("2026-09-12");
    const load = eventAdvice(e, eventCountdown(e, at("2026-09-11")), 60, 80).find((a) => a.id === "carbLoad");
    expect(load?.values.gramsPerDay).toBe(540); // 60 kg × 9 g/kg
  });

  it("says to carry your own when the aid stations are unknown", () => {
    expect(adviceOn("2026-08-01")).toContain("carryOwn");
  });

  it("reports the stations instead once they are known", () => {
    const ids = adviceOn("2026-08-01", { ...withStations, date: "2026-09-12" });
    expect(ids).toContain("checkAidStations");
    expect(ids).not.toContain("carryOwn");
  });

  it("carries the numbers rather than a sentence, so every locale writes its own", () => {
    const e = race("2026-09-12");
    for (const a of eventAdvice(e, eventCountdown(e, at("2026-08-01")), 70, 80)) {
      expect(typeof a.id).toBe("string");
      expect(Object.values(a.values).every((v) => typeof v === "number")).toBe(true);
    }
  });
});

describe("carry legs", () => {
  it("splits the course at the aid stations", () => {
    const legs = carryLegs(withStations, 300, 80, 600);
    expect(legs.map((l) => [l.fromKm, l.toKm])).toEqual([
      [0, 10],
      [10, 25],
      [25, 40],
    ]);
  });

  it("charges each leg the fuel that leg actually takes", () => {
    // 300 min over 40 km is 7.5 min/km, so the 15 km middle leg is 112 min.
    const legs = carryLegs(withStations, 300, 80, 600);
    expect(legs[1].minutes).toBe(113);
    expect(legs[1].carbG).toBe(Math.ceil((80 * 113) / 60));
  });

  it("rounds carbohydrate up, because short is the expensive direction", () => {
    const legs = carryLegs(withStations, 300, 80, 600);
    for (const leg of legs) expect(leg.carbG).toBeGreaterThanOrEqual((80 * leg.minutes) / 60);
  });

  it("flags the legs whose fuel has to be on the athlete", () => {
    // Zweilütschinen has no food, so leg 1 must be carried; Wengen does, so the
    // leg into it need not be. The final leg has no station at all.
    expect(carryLegs(withStations, 300, 80, 600).map((l) => l.mustCarry)).toEqual([true, false, true]);
  });

  it("returns nothing when the organiser's stations are unknown", () => {
    expect(carryLegs(JUNGFRAU, 300, 80, 600)).toEqual([]);
  });

  it("ignores a station placed past the finish", () => {
    const bogus: SwissEvent = {
      ...withStations,
      aidStations: [...(withStations.aidStations ?? []), { atKm: 99, name: "Nowhere", water: true, sportsDrink: false, food: false }],
    };
    const legs = carryLegs(bogus, 300, 80, 600);
    expect(legs[legs.length - 1].toKm).toBe(40);
  });
});

describe("readiness", () => {
  const session = (daysAgo: number, hours: number): Activity => ({
    id: `a${daysAgo}`,
    provider: "strava",
    externalId: `e${daysAgo}`,
    sport: "trail-run",
    startTime: new Date(Date.parse("2026-08-01T06:00:00Z") - daysAgo * 86_400_000).toISOString(),
    durationSec: hours * 3600,
    distanceM: hours * 10_000,
  });

  it("takes the longest session inside the window and ignores older ones", () => {
    const acts = [session(10, 3), session(200, 6)];
    expect(longestRecentMin(acts, at("2026-08-01"))).toBe(180);
  });

  it("reports the ratio rather than passing or failing the athlete", () => {
    expect(enduranceRatio(180, 360)).toBe(0.5);
    expect(enduranceRatio(180, 0)).toBe(0);
  });
});

describe("the curated list", () => {
  it("gives every event an organiser to check against", () => {
    // The list is a starting point; the link is what makes that honest.
    for (const e of SWISS_EVENTS) expect(e.organiserUrl, e.id).toMatch(/^https:\/\//);
  });

  it("marks every date approximate unless it was fetched from the organiser", () => {
    // The refresh script is the only thing allowed to clear the flag, and only
    // against a record carrying the URL it came from. An entry that is neither
    // approximate nor traceable would be a date presented as fact by accident.
    for (const e of SWISS_EVENTS) {
      if (e.dateApproximate === true) continue;
      expect(e.confirmedFrom, `${e.id} is not approximate but has no source`).toMatch(/^https?:\/\//);
      expect(e.confirmedAt, `${e.id} has no fetch timestamp`).toBeTruthy();
    }
  });

  it("uses unique ids and ISO dates", () => {
    expect(new Set(SWISS_EVENTS.map((e) => e.id)).size).toBe(SWISS_EVENTS.length);
    for (const e of SWISS_EVENTS) expect(e.date, e.id).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("keeps course figures plausible for the discipline", () => {
    for (const e of SWISS_EVENTS) {
      expect(e.distanceKm, e.id).toBeGreaterThan(0);
      expect(e.ascentM, e.id).toBeGreaterThanOrEqual(0);
      // Nothing in Switzerland climbs more than 100 m per kilometre on average.
      expect(e.ascentM / e.distanceKm, e.id).toBeLessThan(100);
      if (e.maxAltM) expect(e.maxAltM, e.id).toBeLessThan(4700);
    }
  });

  it("lists what is still ahead, soonest first", () => {
    const list = upcomingEvents(at("2026-07-20"));
    expect(list.every((e) => e.date >= "2026-07-20")).toBe(true);
    expect([...list].sort((a, b) => a.date.localeCompare(b.date))).toEqual(list);
  });

  it("finds an event by id and says so when there is none", () => {
    expect(eventById("sierre-zinal")?.name).toBe("Sierre-Zinal");
    expect(eventById("no-such-race")).toBeUndefined();
  });
});
