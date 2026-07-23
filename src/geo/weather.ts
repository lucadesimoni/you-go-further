import type { Conditions } from "../engine";

/**
 * Point weather for a route start. Uses the free, key-less Open-Meteo forecast
 * API, which serves the Swiss ICON-CH / MeteoSwiss model over Switzerland. It
 * maps the current temperature to the engine's {@link Conditions} bucket, which
 * in turn drives fluid and sodium targets. Live call with a deterministic,
 * seasonal fallback when the API isn't reachable.
 */
export interface WeatherNow {
  temperatureC: number;
  humidityPct: number;
  windKmh: number;
  conditions: Conditions;
  source: "meteoswiss" | "estimated";
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
    source: "meteoswiss",
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
  };
}

/** Fetch current weather for a coordinate, falling back to a seasonal estimate. */
export async function fetchWeather(lat: number, lng: number): Promise<WeatherNow> {
  try {
    const url = `${FORECAST_URL}?latitude=${lat}&longitude=${lng}&current=temperature_2m,relative_humidity_2m,wind_speed_10m`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`weather ${res.status}`);
    return parseWeather((await res.json()) as OpenMeteoResponse);
  } catch {
    return estimateWeather(lat);
  }
}
