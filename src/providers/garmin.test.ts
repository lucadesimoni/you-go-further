import { describe, expect, it, vi } from "vitest";
import { GarminProvider, mapGarminActivity, mapGarminSport } from "./garmin";
import { lastNDays } from "../data";

describe("mapGarminSport", () => {
  it("maps Garmin type keys to our vocabulary", () => {
    expect(mapGarminSport("running")).toBe("run");
    expect(mapGarminSport("trail_running")).toBe("trail-run");
    expect(mapGarminSport("cycling")).toBe("ride");
    expect(mapGarminSport("lap_swimming")).toBe("swim");
    expect(mapGarminSport("strength_training")).toBe("other");
  });
});

describe("mapGarminActivity", () => {
  it("normalizes a Garmin activity payload", () => {
    const a = mapGarminActivity({
      activityId: 987,
      activityName: "Interval run",
      activityType: { typeKey: "running" },
      startTimeGMT: "2026-07-10T06:00:00",
      durationInSeconds: 2700,
      distanceInMeters: 9000,
      averageHeartRateInBeatsPerMinute: 158,
      activeKilocalories: 620,
    });
    expect(a.id).toBe("garmin:987");
    expect(a.provider).toBe("garmin");
    expect(a.sport).toBe("run");
    expect(a.durationSec).toBe(2700);
    expect(a.avgHr).toBe(158);
    expect(a.calories).toBe(620);
  });
});

describe("GarminProvider", () => {
  it("returns sample activities with a dev token", async () => {
    const acts = await new GarminProvider().fetchActivities(
      { provider: "garmin", accessToken: "dev-garmin-token" },
      lastNDays(28, new Date("2026-07-18T00:00:00Z")),
    );
    expect(acts.length).toBeGreaterThan(0);
    expect(acts.every((a) => a.provider === "garmin")).toBe(true);
  });

  it("calls the Garmin API with a Bearer token when configured", async () => {
    vi.stubEnv("GARMIN_CONSUMER_KEY", "k");
    vi.stubEnv("GARMIN_CONSUMER_SECRET", "s");
    const fetchImpl = vi.fn(async (url: string, init?: RequestInit) => {
      expect(String(url)).toContain("garmin.com");
      expect((init?.headers as Record<string, string>).Authorization).toBe("Bearer real");
      return new Response(JSON.stringify([{ activityId: 1, activityType: { typeKey: "cycling" }, durationInSeconds: 3600 }]), {
        status: 200,
      });
    }) as unknown as typeof fetch;
    const acts = await new GarminProvider(fetchImpl).fetchActivities(
      { provider: "garmin", accessToken: "real" },
      { after: "2026-07-01T00:00:00Z", before: "2026-07-18T00:00:00Z" },
    );
    expect(fetchImpl).toHaveBeenCalledOnce();
    expect(acts[0].sport).toBe("ride");
    vi.unstubAllEnvs();
  });
});
