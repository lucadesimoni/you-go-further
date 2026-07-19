import { describe, expect, it, vi } from "vitest";
import { mapPolarActivity, mapPolarSport, parseIsoDuration, PolarProvider } from "./polar";
import { lastNDays } from "../data";

describe("parseIsoDuration", () => {
  it("parses ISO-8601 durations to seconds", () => {
    expect(parseIsoDuration("PT1H")).toBe(3600);
    expect(parseIsoDuration("PT1H2M3S")).toBe(3723);
    expect(parseIsoDuration("PT45M")).toBe(2700);
    expect(parseIsoDuration(undefined)).toBe(0);
  });
});

describe("mapPolarSport / mapPolarActivity", () => {
  it("maps sports and fields", () => {
    expect(mapPolarSport("RUNNING")).toBe("run");
    expect(mapPolarSport("CYCLING")).toBe("ride");
    const a = mapPolarActivity({
      id: 55,
      sport: "RUNNING",
      "start-time": "2026-07-10T06:00:00",
      duration: "PT1H",
      distance: 12000,
      "heart-rate": { average: 150, maximum: 172 },
      calories: 700,
    });
    expect(a.id).toBe("polar:55");
    expect(a.sport).toBe("run");
    expect(a.durationSec).toBe(3600);
    expect(a.avgHr).toBe(150);
  });
});

describe("PolarProvider", () => {
  it("returns sample activities with a dev token", async () => {
    const acts = await new PolarProvider().fetchActivities(
      { provider: "polar", accessToken: "dev-polar-token" },
      lastNDays(28, new Date("2026-07-18T00:00:00Z")),
    );
    expect(acts.length).toBeGreaterThan(0);
    expect(acts.every((a) => a.provider === "polar")).toBe(true);
  });

  it("calls the AccessLink API with a Bearer token when configured", async () => {
    vi.stubEnv("POLAR_CLIENT_ID", "id");
    vi.stubEnv("POLAR_CLIENT_SECRET", "secret");
    const fetchImpl = vi.fn(async (url: string, init?: RequestInit) => {
      expect(String(url)).toContain("polaraccesslink.com/v3/exercises");
      expect((init?.headers as Record<string, string>).Authorization).toBe("Bearer real");
      return new Response(JSON.stringify([{ id: 1, sport: "CYCLING", duration: "PT30M" }]), { status: 200 });
    }) as unknown as typeof fetch;
    const acts = await new PolarProvider(fetchImpl).fetchActivities(
      { provider: "polar", accessToken: "real" },
      { after: "2026-07-01T00:00:00Z", before: "2026-07-18T00:00:00Z" },
    );
    expect(fetchImpl).toHaveBeenCalledOnce();
    expect(acts[0].sport).toBe("ride");
    vi.unstubAllEnvs();
  });
});
