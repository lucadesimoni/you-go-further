import { describe, expect, it, vi } from "vitest";
import { mapSuuntoActivity, mapSuuntoSport, SuuntoProvider } from "./suunto";
import { lastNDays } from "../data";

describe("mapSuuntoSport / mapSuuntoActivity", () => {
  it("maps activity types and fields", () => {
    expect(mapSuuntoSport("Trail running")).toBe("trail-run");
    expect(mapSuuntoSport("Swimming")).toBe("swim");
    const a = mapSuuntoActivity({
      workoutId: 77,
      activityType: "Running",
      startTime: Date.parse("2026-07-10T06:00:00Z"),
      totalTime: 3000,
      totalDistance: 10000,
      totalAscent: 120,
      hravg: 155,
      hrmax: 175,
      energyConsumption: 640.4,
    });
    expect(a.id).toBe("suunto:77");
    expect(a.sport).toBe("run");
    expect(a.durationSec).toBe(3000);
    expect(a.elevationGainM).toBe(120);
    expect(a.calories).toBe(640);
  });
});

describe("SuuntoProvider", () => {
  it("returns sample activities with a dev token", async () => {
    const acts = await new SuuntoProvider().fetchActivities(
      { provider: "suunto", accessToken: "dev-suunto-token" },
      lastNDays(28, new Date("2026-07-18T00:00:00Z")),
    );
    expect(acts.length).toBeGreaterThan(0);
    expect(acts.every((a) => a.provider === "suunto")).toBe(true);
  });

  it("calls the Suunto Cloud API and reads the payload array when configured", async () => {
    vi.stubEnv("SUUNTO_CLIENT_ID", "id");
    vi.stubEnv("SUUNTO_CLIENT_SECRET", "secret");
    const fetchImpl = vi.fn(async (url: string, init?: RequestInit) => {
      expect(String(url)).toContain("cloudapi.suunto.com/v2/workouts");
      expect((init?.headers as Record<string, string>).Authorization).toBe("Bearer real");
      return new Response(JSON.stringify({ payload: [{ workoutId: 2, activityType: "Cycling", totalTime: 3600 }] }), {
        status: 200,
      });
    }) as unknown as typeof fetch;
    const acts = await new SuuntoProvider(fetchImpl).fetchActivities(
      { provider: "suunto", accessToken: "real" },
      { after: "2026-07-01T00:00:00Z", before: "2026-07-18T00:00:00Z" },
    );
    expect(fetchImpl).toHaveBeenCalledOnce();
    expect(acts[0].sport).toBe("ride");
    vi.unstubAllEnvs();
  });
});
