import { describe, expect, it } from "vitest";
import { generateSampleActivities } from "./sampleData";

const window = () => {
  const before = new Date("2024-06-01T00:00:00Z").toISOString();
  const after = new Date("2024-05-04T00:00:00Z").toISOString();
  return { after, before };
};

describe("generateSampleActivities — GPS routes", () => {
  it("is deterministic for the same window", () => {
    const { after, before } = window();
    expect(generateSampleActivities("strava", after, before)).toEqual(
      generateSampleActivities("strava", after, before),
    );
  });

  it("attaches a valid Swiss route to outdoor sessions", () => {
    const { after, before } = window();
    // Not every non-swim session is outdoors: a trainer ride and a treadmill
    // run have no GPS, and sample data that pretended otherwise never let the
    // app meet a session without a route.
    const all = generateSampleActivities("strava", after, before);
    const outdoor = all.filter((a) => a.route && a.route.length > 0);
    expect(outdoor.length).toBeGreaterThan(0);
    expect(outdoor.length / all.length, "most sessions should still be outdoors").toBeGreaterThan(0.5);
    for (const a of outdoor) {
      expect(a.route && a.route.length).toBeGreaterThan(2);
      for (const [lat, lng] of a.route!) {
        // Roughly within Switzerland's bounding box.
        expect(lat).toBeGreaterThan(45.5);
        expect(lat).toBeLessThan(48);
        expect(lng).toBeGreaterThan(5.5);
        expect(lng).toBeLessThan(11);
      }
    }
  });

  it("gives pool swims no GPS track", () => {
    const { after, before } = window();
    const swims = generateSampleActivities("garmin", after, before).filter((a) => a.sport === "swim");
    for (const a of swims) expect(a.route).toBeUndefined();
  });

  it("returns a closed loop (finish near start)", () => {
    const { after, before } = window();
    const a = generateSampleActivities("strava", after, before).find((x) => x.route)!;
    const [s, e] = [a.route![0], a.route![a.route!.length - 1]];
    expect(Math.abs(s[0] - e[0])).toBeLessThan(0.02);
    expect(Math.abs(s[1] - e[1])).toBeLessThan(0.02);
  });
});

describe("sample data is physiologically coherent", () => {
  /**
   * Sample data is what the demo, the screenshots and every e2e run are judged
   * on, so an impossible session in it is a product defect rather than a test
   * detail. Speed used to be drawn independently of duration, which produced a
   * 3.5-hour run at 4:24/km over 48 km — and a 100 km Swiss ride with 254 m of
   * climbing.
   */
  const after = new Date(Date.now() - 90 * 86_400_000).toISOString();
  const before = new Date().toISOString();
  const providers = ["strava", "garmin", "polar", "suunto"] as const;

  it("never invents a pace no human sustains for that long", () => {
    for (const p of providers) {
      for (const a of generateSampleActivities(p, after, before)) {
        if (!a.distanceM || a.sport === "swim") continue;
        const kmh = a.distanceM / 1000 / (a.durationSec / 3600);
        if (a.sport === "ride") {
          expect(kmh, `${p} ride ${kmh.toFixed(1)} km/h`).toBeGreaterThan(12);
          expect(kmh, `${p} ride ${kmh.toFixed(1)} km/h`).toBeLessThan(45);
        } else {
          expect(kmh, `${p} ${a.sport} ${kmh.toFixed(1)} km/h`).toBeGreaterThan(6);
          // 4:00/km held for hours is elite; sample data should not imply it.
          expect(kmh, `${p} ${a.sport} ${kmh.toFixed(1)} km/h`).toBeLessThan(15);
        }
      }
    }
  });

  it("keeps a swim a swim", () => {
    for (const p of providers) {
      for (const a of generateSampleActivities(p, after, before)) {
        if (a.sport !== "swim") continue;
        expect(a.durationSec, "swim duration").toBeLessThan(90 * 60);
        if (a.distanceM) expect(a.distanceM, "swim distance").toBeLessThan(6000);
      }
    }
  });

  it("climbs like Switzerland, not like a polder", () => {
    for (const p of providers) {
      const outdoor = generateSampleActivities(p, after, before).filter((a) => a.route && a.distanceM);
      const trails = outdoor.filter((a) => a.sport === "trail-run");
      for (const a of trails) {
        const perKm = (a.elevationGainM ?? 0) / (a.distanceM! / 1000);
        expect(perKm, `${p} trail ${perKm.toFixed(0)} m/km`).toBeGreaterThan(15);
      }
    }
  });

  it("includes sessions with no GPS at all, because real weeks have them", () => {
    // A plan has to cope with a session that has no route. Data in which every
    // session has a track never exercises that path.
    //
    // Swims are excluded from the share: a pool swim carries no GPS by
    // definition, so counting it as "indoor drift" made this assertion depend
    // on how many swims a given seed happened to draw — which is why it failed
    // intermittently rather than never.
    for (const p of providers) {
      const acts = generateSampleActivities(p, after, before);
      const withoutRoute = acts.filter((a) => !a.route || a.route.length === 0);
      expect(withoutRoute.length, `${p} has no indoor sessions at all`).toBeGreaterThan(0);
      const land = acts.filter((a) => a.sport !== "swim");
      const landIndoor = land.filter((a) => !a.route || a.route.length === 0);
      expect(landIndoor.length, `${p} is almost all indoor`).toBeLessThan(land.length * 0.5);
    }
  });

  it("only claims a capability the provider actually has", () => {
    // Strava reports no training load, and Suunto no power. Sample data that
    // invented either would make the app look better than it can be.
    for (const a of generateSampleActivities("strava", after, before)) {
      expect(a.trainingLoad).toBeUndefined();
    }
    for (const a of generateSampleActivities("suunto", after, before)) {
      expect(a.avgPowerW).toBeUndefined();
    }
  });
});

describe("a demo that holds still", () => {
  /**
   * The generator used to seed from the window start — a millisecond-precision
   * timestamp — so two calls a millisecond apart returned 19 and 21 sessions
   * with no ids in common. The demo's whole training history reset on every
   * render, and because `externalId` was that same millisecond, the same run
   * synced twice was two different activities.
   */
  const at = (iso: string) => new Date(iso).toISOString();

  it("returns the same sessions however precisely you ask", () => {
    const a = generateSampleActivities("strava", at("2026-05-04T00:00:00Z"), at("2026-06-01T00:00:00Z"));
    const b = generateSampleActivities("strava", at("2026-05-04T00:00:00.007Z"), at("2026-06-01T00:00:00.011Z"));
    expect(b).toEqual(a);
  });

  it("gives a day's session one identity, so a re-sync deduplicates", () => {
    const first = generateSampleActivities("garmin", at("2026-05-04T00:00:00Z"), at("2026-06-01T00:00:00Z"));
    const again = generateSampleActivities("garmin", at("2026-05-04T09:31:00Z"), at("2026-06-01T18:02:00Z"));
    const ids = new Set(first.map((x) => x.id));
    expect(again.every((x) => ids.has(x.id))).toBe(true);
    // And an id says which day it was, rather than when it was asked for.
    for (const a of first) expect(a.externalId).toBe(a.startTime.slice(0, 10));
  });

  it("keeps the overlapping days identical when the window widens", () => {
    // Asking for 90 days must not rewrite the 28 the athlete already saw.
    const short = generateSampleActivities("polar", at("2026-05-04T00:00:00Z"), at("2026-06-01T00:00:00Z"));
    const long = generateSampleActivities("polar", at("2026-03-01T00:00:00Z"), at("2026-06-01T00:00:00Z"));
    const byId = new Map(long.map((a) => [a.id, a]));
    for (const a of short) expect(byId.get(a.id)).toEqual(a);
  });

  it("gives two athletes on the same provider different training", () => {
    // A squad in which everyone trained identically is a squad view that says
    // nothing, and the roster shares providers.
    const a = generateSampleActivities("strava", at("2026-05-04T00:00:00Z"), at("2026-06-01T00:00:00Z"), {
      athleteKey: "nina",
    });
    const b = generateSampleActivities("strava", at("2026-05-04T00:00:00Z"), at("2026-06-01T00:00:00Z"), {
      athleteKey: "luca",
    });
    expect(a).not.toEqual(b);
  });

  it("still accepts a bare maxHr, the way the older callers pass it", () => {
    const acts = generateSampleActivities("garmin", at("2026-05-04T00:00:00Z"), at("2026-06-01T00:00:00Z"), 175);
    expect(acts.length).toBeGreaterThan(0);
    for (const a of acts) expect(a.maxHr ?? 0).toBeLessThanOrEqual(175);
  });

  it("returns nothing for a backwards or unparseable window instead of looping", () => {
    expect(generateSampleActivities("strava", at("2026-06-01T00:00:00Z"), at("2026-05-04T00:00:00Z"))).toEqual([]);
    expect(generateSampleActivities("strava", "not-a-date", at("2026-06-01T00:00:00Z"))).toEqual([]);
  });
});

describe("a week that looks like a week", () => {
  const acts = generateSampleActivities("strava", "2026-01-05T00:00:00Z", "2026-06-01T00:00:00Z");
  const dow = (a: (typeof acts)[number]) => new Date(a.startTime).getUTCDay();

  it("rests, rather than training every single day", () => {
    // Sessions drawn one per day at random give a history with no rest days,
    // which the acute:chronic ratio then reads as a heroic athlete.
    const days = new Set(acts.map((a) => a.externalId));
    const span = Math.round((Date.parse("2026-06-01") - Date.parse("2026-01-05")) / 86_400_000);
    expect(days.size).toBeLessThan(span * 0.8);
    expect(days.size).toBeGreaterThan(span * 0.4);
  });

  it("puts the long session at the weekend", () => {
    const longest = [...acts].sort((a, b) => b.durationSec - a.durationSec).slice(0, 10);
    const weekend = longest.filter((a) => dow(a) === 0 || dow(a) === 6);
    expect(weekend.length, "the longest sessions should mostly be Sat/Sun").toBeGreaterThanOrEqual(6);
  });

  it("keeps Friday mostly clear", () => {
    const fri = acts.filter((a) => dow(a) === 5).length;
    const wed = acts.filter((a) => dow(a) === 3).length;
    expect(fri).toBeLessThan(wed);
  });

  it("varies volume week to week instead of running flat", () => {
    // A recovery week every fourth week is what makes the form curve mean
    // something rather than drift.
    const byWeek = new Map<number, number>();
    for (const a of acts) {
      const w = Math.floor(Date.parse(a.startTime) / (7 * 86_400_000));
      byWeek.set(w, (byWeek.get(w) ?? 0) + a.durationSec / 3600);
    }
    const hours = [...byWeek.values()];
    const mean = hours.reduce((s, h) => s + h, 0) / hours.length;
    expect(Math.min(...hours)).toBeLessThan(mean * 0.8);
    expect(Math.max(...hours)).toBeGreaterThan(mean * 1.15);
  });

  it("names sessions the way a provider does", () => {
    // Every session used to be called "run session" / "trail-run session".
    // Checked against the sport rather than by pattern: "Tempo session" is a
    // perfectly good name and an earlier version of this test rejected it.
    expect(acts.every((a) => a.name && a.name !== `${a.sport} session`)).toBe(true);
    expect(new Set(acts.map((a) => a.name)).size).toBeGreaterThan(5);
  });

  it("trains harder on the hard days", () => {
    // Intensity has to show up in the data, or every session looks the same to
    // the analysis that reads it.
    const hr = acts.filter((a) => a.avgHr).map((a) => a.avgHr!);
    expect(Math.max(...hr) - Math.min(...hr)).toBeGreaterThan(25);
  });

  it("keeps one athlete in one place", () => {
    // A new random Swiss trailhead per session put someone in Zürich on Tuesday
    // and Zermatt on Wednesday.
    const starts = acts.filter((a) => a.route).map((a) => a.route![0]);
    const lats = starts.map((s) => s[0]);
    expect(Math.max(...lats) - Math.min(...lats), "home should be one place").toBeLessThan(0.5);
  });

  it("starts sessions at hours people actually train", () => {
    for (const a of acts) {
      const h = new Date(a.startTime).getUTCHours();
      expect(h, `${a.name} at ${h}:00`).toBeGreaterThanOrEqual(6);
      expect(h, `${a.name} at ${h}:00`).toBeLessThan(20);
    }
  });
});
