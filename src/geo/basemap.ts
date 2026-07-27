import type { LatLng } from "../model";

/**
 * Base maps for the route view.
 *
 * Swiss routes get the **official swisstopo** national map — the same
 * Landeskarte an athlete already reads on paper, with its hiking-relevant
 * shading, contours and trails. swisstopo publishes it as a key-less WMTS under
 * the Federal Geoinformation Ordinance's open-data terms; attribution is
 * required and is set on every layer below.
 *
 * Outside Switzerland the swisstopo tiles simply don't exist, so we fall back to
 * OpenStreetMap rather than showing an athlete a grey void.
 */

export interface BaseMapLayer {
  id: string;
  label: string;
  url: string;
  attribution: string;
  maxZoom: number;
}

/**
 * swisstopo WMTS, RESTful pseudo-Mercator (EPSG:3857) endpoint so it drops
 * straight into Leaflet's default projection.
 *
 * `current` is swisstopo's moving alias for the newest published edition, so the
 * map stays up to date without us pinning a release date that will rot.
 */
const SWISSTOPO = "https://wmts.geo.admin.ch/1.0.0";
const SWISSTOPO_ATTRIB =
  '&copy; <a href="https://www.swisstopo.admin.ch">swisstopo</a>';

export const SWISS_LAYERS: BaseMapLayer[] = [
  {
    id: "pixelkarte-farbe",
    label: "National map",
    // The classic colour Landeskarte.
    url: `${SWISSTOPO}/ch.swisstopo.pixelkarte-farbe/default/current/3857/{z}/{x}/{y}.jpeg`,
    attribution: SWISSTOPO_ATTRIB,
    maxZoom: 18,
  },
  {
    id: "swissimage",
    label: "Aerial",
    url: `${SWISSTOPO}/ch.swisstopo.swissimage/default/current/3857/{z}/{x}/{y}.jpeg`,
    attribution: SWISSTOPO_ATTRIB,
    maxZoom: 18,
  },
  {
    id: "pixelkarte-grau",
    label: "Muted",
    // Grey edition — the route line reads best against this one.
    url: `${SWISSTOPO}/ch.swisstopo.pixelkarte-grau/default/current/3857/{z}/{x}/{y}.jpeg`,
    attribution: SWISSTOPO_ATTRIB,
    maxZoom: 18,
  },
];

export const OSM_LAYER: BaseMapLayer = {
  id: "osm",
  label: "OpenStreetMap",
  url: "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png",
  attribution:
    '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
  maxZoom: 19,
};

/**
 * Bounding box of the swisstopo tile coverage (Switzerland + Liechtenstein and
 * a small border margin). Generous on purpose: a route that steps over the
 * border into Chamonix or the Valtellina should still get the Swiss map.
 */
const CH_BOUNDS = { minLat: 45.5, maxLat: 48.0, minLng: 5.6, maxLng: 10.7 };

export function isInSwitzerland([lat, lng]: LatLng): boolean {
  return lat >= CH_BOUNDS.minLat && lat <= CH_BOUNDS.maxLat && lng >= CH_BOUNDS.minLng && lng <= CH_BOUNDS.maxLng;
}

/**
 * Which base maps to offer for a route. A route counts as Swiss when most of it
 * is inside the coverage, so a single stray GPS point can't demote the map.
 */
export function layersForRoute(route: LatLng[]): { layers: BaseMapLayer[]; swiss: boolean } {
  if (route.length === 0) return { layers: [OSM_LAYER], swiss: false };
  const inside = route.filter(isInSwitzerland).length;
  const swiss = inside / route.length > 0.5;
  // OSM stays available as a fallback even on Swiss routes: if swisstopo is
  // unreachable the athlete can still see where they ran.
  return swiss ? { layers: [...SWISS_LAYERS, OSM_LAYER], swiss: true } : { layers: [OSM_LAYER], swiss: false };
}
