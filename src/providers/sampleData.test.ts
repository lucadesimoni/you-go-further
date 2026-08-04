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
    for (const p of providers) {
      const acts = generateSampleActivities(p, after, before);
      const withoutRoute = acts.filter((a) => !a.route || a.route.length === 0);
      expect(withoutRoute.length, `${p} has no indoor sessions at all`).toBeGreaterThan(0);
      expect(withoutRoute.length, `${p} is almost all indoor`).toBeLessThan(acts.length * 0.5);
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
