import { describe, expect, it, vi, afterEach } from "vitest";
import {
  wgs84ToLv95,
  classifyTerrain,
  parseProfile,
  estimateTerrain,
  fetchTerrain,
  conditionsForTemp,
  parseWeather,
  estimateWeather,
  fetchWeather,
  fuelingImplications,
  enrichRoute,
} from "./index";
import type { LatLng } from "../model";

const ROUTE: LatLng[] = [
  [46.95, 7.44],
  [46.96, 7.45],
  [46.97, 7.46],
];

afterEach(() => vi.unstubAllGlobals());

describe("swisstopo projection & terrain", () => {
  it("reprojects the LV95 origin (old Bern observatory) to ~2600000 / 1200000", () => {
    const [e, n] = wgs84ToLv95(46.9510811, 7.4386372);
    expect(Math.abs(e - 2_600_000)).toBeLessThan(5);
    expect(Math.abs(n - 1_200_000)).toBeLessThan(5);
  });

  it("classifies terrain by climb per km", () => {
    expect(classifyTerrain(5, 10)).toBe("flat");
    expect(classifyTerrain(200, 10)).toBe("rolling");
    expect(classifyTerrain(450, 10)).toBe("hilly");
    expect(classifyTerrain(900, 10)).toBe("mountainous");
  });

  it("parses a profile into ascent/descent/min/max", () => {
    const t = parseProfile([
      { dist: 0, alts: { COMB: 500 } },
      { dist: 1000, alts: { COMB: 560 } },
      { dist: 2000, alts: { COMB: 540 } },
    ]);
    expect(t.ascentM).toBe(60);
    expect(t.descentM).toBe(20);
    expect(t.minAltM).toBe(500);
    expect(t.maxAltM).toBe(560);
    expect(t.distanceKm).toBe(2);
    expect(t.source).toBe("swisstopo");
  });

  it("estimates terrain honouring a known gain when offline", () => {
    const t = estimateTerrain(ROUTE, 800);
    expect(t.ascentM).toBe(800);
    expect(t.source).toBe("estimated");
  });

  it("fetchTerrain uses swisstopo when reachable", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => [
          { dist: 0, alts: { COMB: 600 } },
          { dist: 5000, alts: { COMB: 1200 } },
        ],
      }),
    );
    const t = await fetchTerrain(ROUTE);
    expect(t.source).toBe("swisstopo");
    expect(t.ascentM).toBe(600);
  });

  it("fetchTerrain falls back to an estimate on failure", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network")));
    const t = await fetchTerrain(ROUTE, 500);
    expect(t.source).toBe("estimated");
    expect(t.ascentM).toBe(500);
  });
});

describe("weather", () => {
  it("buckets temperature into conditions", () => {
    expect(conditionsForTemp(5)).toBe("cool");
    expect(conditionsForTemp(16)).toBe("temperate");
    expect(conditionsForTemp(28)).toBe("hot");
  });

  it("parses an Open-Meteo response", () => {
    const w = parseWeather({ current: { temperature_2m: 26.4, relative_humidity_2m: 70, wind_speed_10m: 12 } });
    expect(w.temperatureC).toBe(26);
    expect(w.conditions).toBe("hot");
    expect(w.source).toBe("meteoswiss");
  });

  it("estimates seasonally when offline", () => {
    const w = estimateWeather(46.95, 6); // July
    expect(w.source).toBe("estimated");
    expect(w.temperatureC).toBeGreaterThan(10);
  });

  it("fetchWeather falls back on failure", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network")));
    const w = await fetchWeather(46.95, 7.44);
    expect(w.source).toBe("estimated");
  });
});

describe("fueling implications & enrichRoute", () => {
  it("flags heat and big climbs", () => {
    const impl = fuelingImplications(
      { distanceKm: 20, ascentM: 1200, descentM: 1200, minAltM: 600, maxAltM: 1800, terrain: "mountainous", source: "swisstopo" },
      { temperatureC: 29, humidityPct: 50, windKmh: 5, conditions: "hot", source: "meteoswiss" },
    );
    expect(impl.join(" ")).toMatch(/sodium/i);
    expect(impl.join(" ")).toMatch(/climbing/i);
  });

  it("enrichRoute combines terrain + weather offline", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
    const r = await enrichRoute(ROUTE, 400);
    expect(r.terrain.source).toBe("estimated");
    expect(r.weather.source).toBe("estimated");
    expect(Array.isArray(r.implications)).toBe(true);
  });
});
