import type { Conditions } from "../engine";
import type { LatLng } from "../model";
import { fetchNearestStation, type StationReading } from "./meteoswiss";

/**
 * Point weather for a route start, mapped to the engine's {@link Conditions}
 * bucket, which drives fluid and sodium targets.
 *
 * Three sources, best first, each degrading to the next so the plan is never
 * blocked on a network call:
 *
 *  1. `station`  — a real MeteoSwiss SwissMetNet measurement from the nearest
 *                  federal station. Measured, not modelled.
 *  2. `forecast` — the ICON-CH model (MeteoSwiss's own numerical model) served
 *                  key-less by Open-Meteo. A model, and labelled as one.
 *  3. `estimated`— a seasonal climatology, when nothing is reachable.
 *
 * The distinction is shown in the UI: telling an athlete it is 13 °C is only
 * useful if they know whether that was measured up the valley or guessed.
 */
export type WeatherSource = "station" | "forecast" | "estimated";

export interface WeatherNow {
  temperatureC: number;
  humidityPct: number;
  windKmh: number;
  conditions: Conditions;
  source: WeatherSource;
  /** Where the reading came from, e.g. "MeteoSwiss · Lausanne (4 km)". */
  sourceLabel: string;
  /** When the station measured it, for the station source. */
  measuredAt?: string;
}

const FORECAST_URL = "https://api.open-meteo.com/v1/forecast";

/** Bucket a temperature into the fueling-relevant conditions band. */
export function conditionsForTemp(tempC: number): Conditions {
  if (tempC < 10) return "cool";
  if (tempC > 22) return "hot";
  return "temperate";
}

interface OpenMeteoResponse {
  current?: { temperature_2m?: number; relative_humidity_2m?: number; wind_speed_10m?: number };
}

/** Parse an Open-Meteo current-weather response. */
export function parseWeather(data: OpenMeteoResponse): WeatherNow {
  const t = Math.round(data.current?.temperature_2m ?? 15);
  return {
    temperatureC: t,
    humidityPct: Math.round(data.current?.relative_humidity_2m ?? 55),
    windKmh: Math.round(data.current?.wind_speed_10m ?? 6),
    conditions: conditionsForTemp(t),
    source: "forecast",
    sourceLabel: "ICON-CH model (MeteoSwiss) via Open-Meteo",
  };
}

/** Turn a MeteoSwiss station reading into the shape the engine consumes. */
export function fromStation(station: StationReading, distanceKm: number): WeatherNow {
  const t = Math.round(station.temperatureC ?? 15);
  return {
    temperatureC: t,
    humidityPct: Math.round(station.humidityPct ?? 55),
    windKmh: Math.round(station.windKmh ?? 6),
    conditions: conditionsForTemp(t),
    source: "station",
    sourceLabel: `MeteoSwiss · ${station.stationName} (${distanceKm} km)`,
    measuredAt: station.measuredAt,
  };
}

/** Seasonal estimate for a Swiss latitude when the API isn't reachable. */
export function estimateWeather(lat: number, month = new Date().getMonth()): WeatherNow {
  // Rough monthly mean for the Swiss plateau, cooled by ~0.6 °C per 100 m — here
  // approximated by latitude as a stand-in for altitude.
  const monthly = [1, 2, 6, 10, 15, 18, 20, 19, 15, 10, 5, 2];
  const t = Math.round(monthly[month] - Math.max(0, 47.6 - lat) * 6);
  return {
    temperatureC: t,
    humidityPct: 60,
    windKmh: 8,
    conditions: conditionsForTemp(t),
    source: "estimated",
    sourceLabel: "Seasonal estimate — no live data reachable",
  };
}

/**
 * Current weather for a coordinate: a measured MeteoSwiss station if one is
 * close enough, otherwise the ICON-CH forecast, otherwise a seasonal estimate.
 */
export async function fetchWeather(lat: number, lng: number): Promise<WeatherNow> {
  const at: LatLng = [lat, lng];

  // 1. Measured beats modelled.
  const near = await fetchNearestStation(at).catch(() => null);
  if (near) return fromStation(near.station, near.distanceKm);

  // 2. The model MeteoSwiss itself runs for Switzerland.
  try {
    const url = `${FORECAST_URL}?latitude=${lat}&longitude=${lng}&current=temperature_2m,relative_humidity_2m,wind_speed_10m`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`weather ${res.status}`);
    return parseWeather((await res.json()) as OpenMeteoResponse);
  } catch {
    // 3. Say plainly that this is a guess.
    return estimateWeather(lat);
  }
}
