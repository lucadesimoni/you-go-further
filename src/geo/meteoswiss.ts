import type { LatLng } from "../model";

/**
 * MeteoSwiss automatic measuring network (SwissMetNet).
 *
 * This is the *measured* Swiss weather — roughly 160 federal stations reporting
 * every 10 minutes — published as open data by the Federal Office of
 * Meteorology and Climatology under its open-data terms. It is genuinely
 * MeteoSwiss, as opposed to a model forecast, which matters for a fuelling plan:
 * a reading from a station 8 km up the valley beats an interpolated grid cell.
 *
 * The dataset URL is configurable because MeteoSwiss has been migrating its
 * open-data platform; `METEOSWISS_STATIONS_URL` overrides the default without a
 * code change. Everything is written to degrade rather than fail — the caller
 * falls back to the ICON-CH forecast, then to a seasonal estimate.
 */

export interface StationReading {
  stationId: string;
  stationName: string;
  /** Station position, used to pick the nearest to the athlete's route. */
  position: LatLng;
  altitudeM?: number;
  temperatureC?: number;
  humidityPct?: number;
  windKmh?: number;
  /** When the station recorded it. */
  measuredAt?: string;
}

const DEFAULT_STATIONS_URL =
  "https://data.geo.admin.ch/ch.meteoschweiz.messwerte-aktuell/ch.meteoschweiz.messwerte-aktuell_en.json";

const env = (k: string): string | undefined =>
  (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env?.[k];

export const stationsUrl = (): string => env("METEOSWISS_STATIONS_URL") ?? DEFAULT_STATIONS_URL;

/** Great-circle distance in km — good enough to rank nearby stations. */
export function distanceKm([lat1, lon1]: LatLng, [lat2, lon2]: LatLng): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)));
}

const num = (v: unknown): number | undefined => {
  const n = typeof v === "string" ? Number(v) : v;
  return typeof n === "number" && Number.isFinite(n) ? n : undefined;
};

/**
 * Parse the MeteoSwiss station feed.
 *
 * It is published as GeoJSON: a `features` array whose geometry carries the
 * station position and whose properties carry the latest values. Field naming
 * has varied across platform revisions, so each value is read from any of its
 * known spellings and simply omitted when absent — a renamed field costs us one
 * measurement, not the whole reading.
 */
export function parseStations(data: unknown): StationReading[] {
  const features = (data as { features?: unknown[] })?.features;
  if (!Array.isArray(features)) return [];
  const out: StationReading[] = [];
  for (const f of features) {
    const feat = f as {
      id?: string;
      geometry?: { coordinates?: unknown };
      properties?: Record<string, unknown>;
    };
    const coords = feat.geometry?.coordinates;
    // GeoJSON is [lng, lat] — the opposite of our LatLng.
    if (!Array.isArray(coords) || coords.length < 2) continue;
    const lng = num(coords[0]);
    const lat = num(coords[1]);
    if (lat === undefined || lng === undefined) continue;

    const p = feat.properties ?? {};
    const pick = (...keys: string[]): number | undefined => {
      for (const k of keys) {
        const v = num(p[k]);
        if (v !== undefined) return v;
      }
      return undefined;
    };
    const stationId = String(feat.id ?? p.station_abbr ?? p.abbr ?? p.id ?? "").trim();
    if (!stationId) continue;

    out.push({
      stationId,
      stationName: String(p.station_name ?? p.name ?? stationId),
      position: [lat, lng],
      altitudeM: pick("station_height_masl", "altitude", "height"),
      temperatureC: pick("tre200s0", "temperature", "air_temperature"),
      humidityPct: pick("ure200s0", "humidity", "relative_humidity"),
      // MeteoSwiss reports wind in m/s; convert to the km/h the UI shows.
      windKmh: (() => {
        const kmh = pick("wind_speed_kmh");
        if (kmh !== undefined) return kmh;
        const ms = pick("fu3010z0", "wind_speed", "windspeed");
        return ms === undefined ? undefined : Math.round(ms * 3.6);
      })(),
      measuredAt: typeof p.reference_ts === "string" ? p.reference_ts : undefined,
    });
  }
  return out;
}

/**
 * The closest station to a point that actually reports a temperature, within
 * `maxKm`. A station with no reading is no use, and one 60 km away over a pass
 * is worse than the model — hence the cut-off.
 */
export function nearestStation(
  stations: StationReading[],
  at: LatLng,
  maxKm = 25,
): { station: StationReading; distanceKm: number } | null {
  let best: { station: StationReading; distanceKm: number } | null = null;
  for (const s of stations) {
    if (s.temperatureC === undefined) continue;
    const d = distanceKm(at, s.position);
    if (d > maxKm) continue;
    if (!best || d < best.distanceKm) best = { station: s, distanceKm: Math.round(d * 10) / 10 };
  }
  return best;
}

/**
 * Fetch the nearest MeteoSwiss station reading for a point. Returns null on any
 * failure — an unreachable service, a changed schema, or simply no station close
 * enough — so the caller can fall back without special-casing.
 */
export async function fetchNearestStation(
  at: LatLng,
  fetchImpl: typeof fetch = fetch,
): Promise<{ station: StationReading; distanceKm: number } | null> {
  try {
    const res = await fetchImpl(stationsUrl());
    if (!res.ok) return null;
    return nearestStation(parseStations(await res.json()), at);
  } catch {
    return null;
  }
}
