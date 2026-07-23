import type { LatLng } from "../model";

/**
 * Terrain from swisstopo — the Swiss Federal Office of Topography. Given a route
 * (WGS84 lat/lng) it queries the public elevation-profile service
 * (`api3.geo.admin.ch/rest/services/profile.json`, no API key) and derives the
 * climbing and terrain type that drive carbohydrate demand.
 *
 * The service works in Swiss LV95 coordinates, so we reproject WGS84 → LV95 with
 * swisstopo's official approximate formulas (~1 m accuracy — ample for a DEM
 * lookup). Like the activity connectors, a live call is attempted and a
 * deterministic estimate is used when the API isn't reachable (offline / demo).
 */
export type TerrainType = "flat" | "rolling" | "hilly" | "mountainous";

export interface TerrainProfile {
  distanceKm: number;
  ascentM: number;
  descentM: number;
  minAltM: number;
  maxAltM: number;
  terrain: TerrainType;
  /** Whether the numbers came from swisstopo or a local estimate. */
  source: "swisstopo" | "estimated";
}

const PROFILE_URL = "https://api3.geo.admin.ch/rest/services/profile.json";

/** swisstopo WGS84 → LV95 (EPSG:2056) approximate transformation. */
export function wgs84ToLv95(lat: number, lon: number): [number, number] {
  const phi = (lat * 3600 - 169028.66) / 10000;
  const lam = (lon * 3600 - 26782.5) / 10000;
  const e =
    2600072.37 +
    211455.93 * lam -
    10938.51 * lam * phi -
    0.36 * lam * phi * phi -
    44.54 * lam ** 3;
  const n =
    1200147.07 +
    308807.95 * phi +
    3745.25 * lam * lam +
    76.63 * phi * phi -
    194.56 * lam * lam * phi +
    119.79 * phi ** 3;
  return [Math.round(e * 100) / 100, Math.round(n * 100) / 100];
}

/** Classify terrain by average climb per kilometre. */
export function classifyTerrain(ascentM: number, distanceKm: number): TerrainType {
  const perKm = distanceKm > 0 ? ascentM / distanceKm : 0;
  if (perKm < 10) return "flat";
  if (perKm < 30) return "rolling";
  if (perKm < 60) return "hilly";
  return "mountainous";
}

interface ProfilePoint {
  dist: number;
  alts: Record<string, number>;
}

/** Turn a swisstopo profile response into ascent/descent/min/max + terrain. */
export function parseProfile(points: ProfilePoint[]): TerrainProfile {
  let ascent = 0;
  let descent = 0;
  let min = Infinity;
  let max = -Infinity;
  let prev: number | undefined;
  for (const p of points) {
    const alt = Object.values(p.alts)[0];
    if (typeof alt !== "number") continue;
    min = Math.min(min, alt);
    max = Math.max(max, alt);
    if (prev !== undefined) {
      const d = alt - prev;
      if (d > 0) ascent += d;
      else descent += -d;
    }
    prev = alt;
  }
  const distanceKm = points.length ? Math.round((points[points.length - 1].dist / 1000) * 10) / 10 : 0;
  const ascentM = Math.round(ascent);
  return {
    distanceKm,
    ascentM,
    descentM: Math.round(descent),
    minAltM: Number.isFinite(min) ? Math.round(min) : 0,
    maxAltM: Number.isFinite(max) ? Math.round(max) : 0,
    terrain: classifyTerrain(ascentM, distanceKm),
    source: "swisstopo",
  };
}

/** Straight-line length of a WGS84 track, in km (equirectangular approximation). */
function trackKm(route: LatLng[]): number {
  let m = 0;
  for (let i = 1; i < route.length; i++) {
    const dLat = (route[i][0] - route[i - 1][0]) * 111_320;
    const dLng = (route[i][1] - route[i - 1][1]) * 111_320 * Math.cos((route[i - 1][0] * Math.PI) / 180);
    m += Math.hypot(dLat, dLng);
  }
  return m / 1000;
}

/** Deterministic estimate when swisstopo isn't reachable, honouring a known gain. */
export function estimateTerrain(route: LatLng[], hintGainM?: number): TerrainProfile {
  const distanceKm = Math.round(trackKm(route) * 10) / 10;
  // Base elevation from latitude band (rough Swiss plateau → alpine gradient).
  const baseAlt = Math.round(350 + (47.6 - route[0][0]) * 900);
  const ascentM = hintGainM ?? Math.round(distanceKm * 18);
  return {
    distanceKm,
    ascentM,
    descentM: ascentM,
    minAltM: Math.max(200, baseAlt),
    maxAltM: Math.max(200, baseAlt) + Math.round(ascentM * 0.6),
    terrain: classifyTerrain(ascentM, distanceKm),
    source: "estimated",
  };
}

/** Fetch the terrain profile from swisstopo, falling back to an estimate. */
export async function fetchTerrain(route: LatLng[], hintGainM?: number): Promise<TerrainProfile> {
  if (route.length < 2) return estimateTerrain(route, hintGainM);
  try {
    const geom = JSON.stringify({
      type: "LineString",
      coordinates: route.map(([lat, lng]) => wgs84ToLv95(lat, lng)),
    });
    const url = `${PROFILE_URL}?geom=${encodeURIComponent(geom)}&sr=2056&nb_points=64&distinct_points=true`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`swisstopo ${res.status}`);
    const points = (await res.json()) as ProfilePoint[];
    if (!Array.isArray(points) || points.length === 0) throw new Error("empty profile");
    return parseProfile(points);
  } catch {
    return estimateTerrain(route, hintGainM);
  }
}
