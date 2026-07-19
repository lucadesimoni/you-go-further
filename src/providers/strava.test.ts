import { describe, expect, it, vi } from "vitest";
import { mapStravaActivity, mapStravaSport, StravaProvider } from "./strava";
import { lastNDays } from "../data";

describe("mapStravaSport", () => {
  it("maps Strava types to our sport vocabulary", () => {
    expect(mapStravaSport("Run")).toBe("run");
    expect(mapStravaSport("TrailRun")).toBe("trail-run");
    expect(mapStravaSport("Ride")).toBe("ride");
    expect(mapStravaSport("VirtualRide")).toBe("ride");
    expect(mapStravaSport("Swim")).toBe("swim");
    expect(mapStravaSport("Yoga")).toBe("other");
  });
});

describe("mapStravaActivity", () => {
  it("normalizes a Strava activity payload", () => {
    const a = mapStravaActivity({
      id: 12345,
      name: "Morning Ride",
      sport_type: "Ride",
      start_date: "2026-07-10T06:00:00Z",
      moving_time: 3600,
      elapsed_time: 3800,
      distance: 30000,
      total_elevation_gain: 420,
      average_heartrate: 142,
      max_heartrate: 168,
      average_watts: 210,
      kilojoules: 780.6,
    });
    expect(a.id).toBe("strava:12345");
    expect(a.provider).toBe("strava");
    expect(a.sport).toBe("ride");
    expect(a.durationSec).toBe(3600); // prefers moving_time
    expect(a.distanceM).toBe(30000);
    expect(a.avgPowerW).toBe(210);
    expect(a.calories).toBe(781); // rounded kilojoules
  });
});

describe("StravaProvider (dev fallback)", () => {
  it("exchanges a dev code for a mock credential", async () => {
    const cred = await new StravaProvider().exchangeToken("dev-code", "http://cb");
    expect(cred.provider).toBe("strava");
    expect(cred.accessToken).toMatch(/^dev-/);
  });

  it("returns sample activities with a dev token", async () => {
    const acts = await new StravaProvider().fetchActivities(
      { provider: "strava", accessToken: "dev-strava-token" },
      lastNDays(28, new Date("2026-07-18T00:00:00Z")),
    );
    expect(acts.length).toBeGreaterThan(0);
    expect(acts.every((a) => a.provider === "strava")).toBe(true);
  });
});

describe("StravaProvider (real API, mocked fetch)", () => {
  it("calls the Strava activities endpoint with a Bearer token and maps the result", async () => {
    vi.stubEnv("STRAVA_CLIENT_ID", "test-id");
    vi.stubEnv("STRAVA_CLIENT_SECRET", "test-secret");
    const fetchImpl = vi.fn(async (url: string, init?: RequestInit) => {
      expect(String(url)).toContain("api/v3/athlete/activities");
      expect((init?.headers as Record<string, string>).Authorization).toBe("Bearer real-token");
      return new Response(JSON.stringify([{ id: 9, type: "Run", start_date: "2026-07-10T06:00:00Z", moving_time: 1800, distance: 5000 }]), {
        status: 200,
      });
    }) as unknown as typeof fetch;

    const provider = new StravaProvider(fetchImpl);
    const acts = await provider.fetchActivities(
      { provider: "strava", accessToken: "real-token" },
      { after: "2026-07-01T00:00:00Z", before: "2026-07-18T00:00:00Z" },
    );
    expect(fetchImpl).toHaveBeenCalledOnce();
    expect(acts).toHaveLength(1);
    expect(acts[0].sport).toBe("run");
    expect(acts[0].id).toBe("strava:9");
    vi.unstubAllEnvs();
  });
});
