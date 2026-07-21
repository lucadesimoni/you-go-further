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
    const outdoor = generateSampleActivities("strava", after, before).filter((a) => a.sport !== "swim");
    expect(outdoor.length).toBeGreaterThan(0);
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
