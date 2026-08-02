import type { LatLng } from "../model";

/**
 * GPX parsing — how a race gets into the app.
 *
 * Every race organiser publishes a GPX, and every route planner (Strava, Komoot,
 * swisstopo, Garmin) exports one. It is the one file format that lets an athlete
 * plan a race they have not run yet, which is the whole point: until now the
 * platform could only reason about sessions already in the past.
 *
 * Hand-rolled rather than DOMParser-based because this must run identically in
 * the browser, in Node (the API) and in tests. GPX is regular enough that a
 * tolerant scan beats an XML dependency: files in the wild carry namespaces
 * (`<gpx:trkpt>`), Garmin/Strava extensions, and both `\r\n` and `\n`.
 */

export interface GpxRoute {
  /** Track/route name from the file, when it has one. */
  name?: string;
  points: LatLng[];
  /** Elevation per point, when the file carries it (metres). */
  elevationsM?: number[];
  /** Great-circle length of the track, km, one decimal. */
  distanceKm: number;
  /** Sum of the positive elevation changes, metres — only when the file has ele. */
  ascentM?: number;
  /** True when the file carried elevation for (nearly) every point. */
  hasElevation: boolean;
}

const R = 6371008.8; // mean Earth radius, metres

/** Great-circle distance between two points, in metres. */
export function haversineM(a: LatLng, b: LatLng): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b[0] - a[0]);
  const dLng = toRad(b[1] - a[1]);
  const lat1 = toRad(a[0]);
  const lat2 = toRad(b[0]);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Length of a polyline in kilometres. */
export function routeDistanceKm(points: LatLng[]): number {
  let m = 0;
  for (let i = 1; i < points.length; i++) m += haversineM(points[i - 1], points[i]);
  return Math.round((m / 1000) * 10) / 10;
}

/**
 * Total climbing, with a 3 m threshold.
 *
 * Barometric and GPS elevation both jitter by a metre or two at rest; summing
 * every positive change would report hundreds of metres of ascent for a flat
 * lakeside run. The threshold is the standard fix and matches what Strava and
 * Garmin report closely enough to be recognisable.
 */
export function ascentM(elevations: number[], thresholdM = 3): number {
  let total = 0;
  let anchor = elevations[0];
  for (const e of elevations) {
    if (e - anchor >= thresholdM) {
      total += e - anchor;
      anchor = e;
    } else if (e < anchor) {
      anchor = e;
    }
  }
  return Math.round(total);
}

const NUM = "[-+]?[0-9]*\\.?[0-9]+";

/**
 * Parse a GPX document. Returns `null` when the file has no usable track —
 * better to say "this file has no route in it" than to draw an empty map.
 *
 * Track points (`trkpt`) are preferred over route points (`rtept`): a recorded
 * or planned *track* is the actual line, while `rtept` is often just waypoints.
 */
export function parseGpx(xml: string): GpxRoute | null {
  if (!xml || !/<(?:\w+:)?gpx[\s>]/i.test(xml)) return null;

  const collect = (tag: string): { points: LatLng[]; eles: (number | undefined)[] } => {
    // Match the element first, then read its attributes separately: the GPX
    // spec does not fix attribute order, and files in the wild carry both
    // `lat lon` and `lon lat`.
    const re = new RegExp(
      `<(?:\\w+:)?${tag}\\b([^>]*?)(?:/>|>([\\s\\S]*?)</(?:\\w+:)?${tag}>)`,
      "gi",
    );
    const attr = (attrs: string, name: string): number => {
      const m = new RegExp(`\\b${name}\\s*=\\s*["'](${NUM})["']`, "i").exec(attrs);
      return m ? Number(m[1]) : NaN;
    };
    const points: LatLng[] = [];
    const eles: (number | undefined)[] = [];
    for (const m of xml.matchAll(re)) {
      const lat = attr(m[1] ?? "", "lat");
      const lon = attr(m[1] ?? "", "lon");
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
      if (Math.abs(lat) > 90 || Math.abs(lon) > 180) continue;
      points.push([Number(lat.toFixed(6)), Number(lon.toFixed(6))]);
      const ele = new RegExp(`<(?:\\w+:)?ele>\\s*(${NUM})\\s*</(?:\\w+:)?ele>`, "i").exec(m[2] ?? "");
      eles.push(ele ? Number(ele[1]) : undefined);
    }
    return { points, eles };
  };

  let { points, eles } = collect("trkpt");
  if (points.length < 2) ({ points, eles } = collect("rtept"));
  if (points.length < 2) return null;

  const nameMatch = /<(?:\w+:)?name>\s*([\s\S]*?)\s*<\/(?:\w+:)?name>/i.exec(xml);
  const name = nameMatch ? decodeXml(nameMatch[1]).slice(0, 120) : undefined;

  // Elevation is only trustworthy if the file has it nearly everywhere; a
  // handful of stray <ele> tags would produce a profile that is mostly invented.
  const known = eles.filter((e) => e !== undefined).length;
  const hasElevation = known >= points.length * 0.9;
  const elevationsM = hasElevation ? eles.map((e, i) => e ?? nearest(eles, i) ?? 0) : undefined;

  return {
    ...(name ? { name } : {}),
    points,
    ...(elevationsM ? { elevationsM, ascentM: ascentM(elevationsM) } : {}),
    distanceKm: routeDistanceKm(points),
    hasElevation,
  };
}

/** Nearest known elevation to index `i` — fills the odd missing sample. */
function nearest(eles: (number | undefined)[], i: number): number | undefined {
  for (let d = 1; d < eles.length; d++) {
    if (eles[i - d] !== undefined) return eles[i - d];
    if (eles[i + d] !== undefined) return eles[i + d];
  }
  return undefined;
}

function decodeXml(s: string): string {
  return s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&amp;/g, "&")
    .trim();
}

/**
 * Estimate a finish time for a route, in minutes.
 *
 * Flat pace plus a climbing penalty: **+10 s per 10 m of ascent** for running
 * (the long-standing trail-running rule of thumb, close to Naismith's 600 m/h
 * of climbing) and a gentler penalty on the bike where descents give more back.
 * It is a starting point the athlete then corrects — the fuelling plan is far
 * more sensitive to duration than to which pace model produced it, so the field
 * is editable and this only has to be in the right neighbourhood.
 */
export function estimateDurationMin(
  distanceKm: number,
  ascent: number,
  flatPaceMinPerKm: number,
  kind: "run" | "ride" = "run",
): number {
  const flat = distanceKm * flatPaceMinPerKm;
  const climb = kind === "ride" ? (ascent / 10) * (1 / 12) : (ascent / 10) * (10 / 60);
  return Math.max(1, Math.round(flat + climb));
}
