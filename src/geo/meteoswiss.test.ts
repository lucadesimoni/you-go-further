import { describe, it, expect } from "vitest";
import { distanceKm, fetchNearestStation, nearestStation, parseStations } from "./meteoswiss";
import { fetchWeather } from "./weather";
import type { LatLng } from "../model";

const LAUSANNE: LatLng = [46.5197, 6.6323];

/** A feature in the shape MeteoSwiss publishes: GeoJSON, [lng, lat]. */
const feature = (id: string, lng: number, lat: number, props: Record<string, unknown> = {}) => ({
  id,
  geometry: { type: "Point", coordinates: [lng, lat] },
  properties: { station_name: `Station ${id}`, tre200s0: 21.4, ure200s0: 62, fu3010z0: 3, ...props },
});

const feed = (...features: unknown[]) => ({ type: "FeatureCollection", features });

describe("parseStations", () => {
  it("reads position, name and measurements from the MeteoSwiss feed", () => {
    const [s] = parseStations(feed(feature("PUY", 6.63, 46.52)));
    expect(s.stationId).toBe("PUY");
    expect(s.stationName).toBe("Station PUY");
    // GeoJSON is [lng, lat]; ours is [lat, lng]. Getting this backwards would
    // put every Swiss station in the Indian Ocean.
    expect(s.position).toEqual([46.52, 6.63]);
    expect(s.temperatureC).toBe(21.4);
    expect(s.humidityPct).toBe(62);
  });

  it("converts wind from m/s to km/h", () => {
    const [s] = parseStations(feed(feature("PUY", 6.63, 46.52, { fu3010z0: 10 })));
    expect(s.windKmh).toBe(36);
  });

  it("takes an explicit km/h field as-is when the feed provides one", () => {
    const [s] = parseStations(feed(feature("PUY", 6.63, 46.52, { wind_speed_kmh: 18, fu3010z0: 99 })));
    expect(s.windKmh).toBe(18);
  });

  it("survives a renamed field by dropping that value, not the station", () => {
    const [s] = parseStations(feed(feature("PUY", 6.63, 46.52, { tre200s0: undefined, temperature: 12 })));
    expect(s.temperatureC).toBe(12);
    const [t] = parseStations(feed(feature("PUY", 6.63, 46.52, { ure200s0: undefined })));
    expect(t.humidityPct).toBeUndefined();
    expect(t.temperatureC).toBe(21.4); // the rest of the reading is intact
  });

  it("ignores malformed payloads rather than throwing", () => {
    expect(parseStations(null)).toEqual([]);
    expect(parseStations({})).toEqual([]);
    expect(parseStations(feed({ id: "X", geometry: {} }))).toEqual([]);
    expect(parseStations(feed({ geometry: { coordinates: [6, 46] }, properties: {} }))).toEqual([]);
  });
});

describe("nearestStation", () => {
  it("picks the closest station that actually reports a temperature", () => {
    const stations = parseStations(
      feed(
        feature("NEAR", 6.64, 46.52, { tre200s0: undefined, temperature: undefined }), // closest, but silent
        feature("GOOD", 6.7, 46.55),
        feature("FAR", 8.5, 47.4),
      ),
    );
    const found = nearestStation(stations, LAUSANNE)!;
    expect(found.station.stationId).toBe("GOOD");
    expect(found.distanceKm).toBeLessThan(10);
  });

  it("returns nothing when the nearest station is too far to be relevant", () => {
    const stations = parseStations(feed(feature("ZRH", 8.55, 47.38)));
    expect(nearestStation(stations, LAUSANNE, 25)).toBeNull();
  });
});

describe("distanceKm", () => {
  it("measures a known Swiss distance", () => {
    // Lausanne → Zürich is ~173 km as the crow flies (the ~210 km everyone
    // quotes is the drive).
    const d = distanceKm(LAUSANNE, [47.3769, 8.5417]);
    expect(d).toBeGreaterThan(165);
    expect(d).toBeLessThan(182);
  });
});

describe("fetchNearestStation", () => {
  it("returns a reading from a live feed", async () => {
    const fake = (async () => ({ ok: true, json: async () => feed(feature("PUY", 6.64, 46.53)) })) as unknown as typeof fetch;
    const got = await fetchNearestStation(LAUSANNE, fake);
    expect(got?.station.stationId).toBe("PUY");
  });

  it("returns null — never throws — when MeteoSwiss is unreachable", async () => {
    const dead = (async () => {
      throw new Error("network down");
    }) as unknown as typeof fetch;
    await expect(fetchNearestStation(LAUSANNE, dead)).resolves.toBeNull();
  });

  it("returns null on a non-OK response", async () => {
    const err = (async () => ({ ok: false, status: 503, json: async () => ({}) })) as unknown as typeof fetch;
    await expect(fetchNearestStation(LAUSANNE, err)).resolves.toBeNull();
  });
});

describe("fetchWeather source chain", () => {
  it("falls all the way back to an honest estimate when nothing is reachable", async () => {
    const realFetch = globalThis.fetch;
    globalThis.fetch = (async () => {
      throw new Error("offline");
    }) as unknown as typeof fetch;
    try {
      const w = await fetchWeather(46.52, 6.63);
      expect(w.source).toBe("estimated");
      // It must not claim to be MeteoSwiss when it is a climatology guess.
      expect(w.sourceLabel).toMatch(/estimate/i);
      expect(w.sourceLabel).not.toMatch(/MeteoSwiss ·/);
    } finally {
      globalThis.fetch = realFetch;
    }
  });

  it("prefers a measured station over the model, and labels which it used", async () => {
    const realFetch = globalThis.fetch;
    globalThis.fetch = (async (url: string) =>
      String(url).includes("meteoschweiz")
        ? { ok: true, json: async () => feed(feature("PUY", 6.64, 46.53, { tre200s0: 27 })) }
        : { ok: true, json: async () => ({ current: { temperature_2m: 5 } }) }) as unknown as typeof fetch;
    try {
      const w = await fetchWeather(46.52, 6.63);
      expect(w.source).toBe("station");
      expect(w.temperatureC).toBe(27); // the station's value, not the model's 5
      expect(w.conditions).toBe("hot");
      expect(w.sourceLabel).toMatch(/^MeteoSwiss · Station PUY/);
    } finally {
      globalThis.fetch = realFetch;
    }
  });

  it("uses the ICON-CH model when no station is close enough, and says so", async () => {
    const realFetch = globalThis.fetch;
    globalThis.fetch = (async (url: string) =>
      String(url).includes("meteoschweiz")
        ? { ok: true, json: async () => feed(feature("ZRH", 8.55, 47.38)) } // 200 km away
        : { ok: true, json: async () => ({ current: { temperature_2m: 4 } }) }) as unknown as typeof fetch;
    try {
      const w = await fetchWeather(46.52, 6.63);
      expect(w.source).toBe("forecast");
      expect(w.temperatureC).toBe(4);
      expect(w.conditions).toBe("cool");
      expect(w.sourceLabel).toMatch(/ICON-CH/);
    } finally {
      globalThis.fetch = realFetch;
    }
  });
});
