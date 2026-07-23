import type { LatLng } from "../model";
import { fetchTerrain, type TerrainProfile } from "./swisstopo";
import { fetchWeather, type WeatherNow } from "./weather";

export {
  wgs84ToLv95,
  classifyTerrain,
  parseProfile,
  estimateTerrain,
  fetchTerrain,
  type TerrainProfile,
  type TerrainType,
} from "./swisstopo";
export {
  conditionsForTemp,
  parseWeather,
  estimateWeather,
  fetchWeather,
  type WeatherNow,
} from "./weather";

export interface RouteConditions {
  terrain: TerrainProfile;
  weather: WeatherNow;
  /** Plain-language fueling implications of the terrain + weather. */
  implications: string[];
}

/** How the terrain + weather change the fueling plan. */
export function fuelingImplications(terrain: TerrainProfile, weather: WeatherNow): string[] {
  const out: string[] = [];
  if (weather.conditions === "hot") {
    out.push(`Hot (${weather.temperatureC}°C) — raise fluid intake and don't skip sodium.`);
  } else if (weather.conditions === "cool") {
    out.push(`Cool (${weather.temperatureC}°C) — fluid needs are lower, but keep carbohydrate up.`);
  }
  if (weather.humidityPct >= 75 && weather.conditions !== "cool") {
    out.push(`Humid (${weather.humidityPct}%) — sweat evaporates poorly, so drink to plan and watch sodium.`);
  }
  if (terrain.terrain === "mountainous" || terrain.terrain === "hilly") {
    out.push(`${terrain.ascentM} m of climbing — carbohydrate demand runs high on the ascents; fuel early.`);
  } else if (terrain.ascentM > 0) {
    out.push(`${terrain.ascentM} m of climbing over ${terrain.distanceKm} km — mostly ${terrain.terrain}.`);
  }
  return out;
}

/**
 * Enrich a planned route with swisstopo terrain and current weather, plus the
 * fueling implications. Both sources degrade gracefully to an estimate offline.
 */
export async function enrichRoute(route: LatLng[], hintGainM?: number): Promise<RouteConditions> {
  const [terrain, weather] = await Promise.all([
    fetchTerrain(route, hintGainM),
    fetchWeather(route[0][0], route[0][1]),
  ]);
  return { terrain, weather, implications: fuelingImplications(terrain, weather) };
}
