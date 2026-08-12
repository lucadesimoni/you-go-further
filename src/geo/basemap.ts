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
 * Layers drawn *on top of* the base map.
 *
 * The base map answers "where am I"; these answer the questions an endurance
 * athlete actually brings to a map — which of these lines is a marked hiking
 * trail, which road is a signed cycle route, which slope is steep enough to
 * matter. They are transparent PNG tiles from the federal services, stacked in
 * the order given.
 *
 * **These identifiers could not be checked against the live service from here**
 * — this repository's sandbox blocks `*.geo.admin.ch`. So the map treats an
 * overlay that fails to load as a fact about the world rather than a silent
 * nothing: the layer switches itself off and says the layer is unavailable,
 * which is also the right behaviour when swisstopo renames one in five years.
 */
export interface OverlayLayer extends BaseMapLayer {
  /** One line on what this shows, for the layer switcher. */
  hint: string;
  /** Drawn at less than full strength so the route line stays readable. */
  opacity: number;
}

export const SWISS_OVERLAYS: OverlayLayer[] = [
  {
    id: "wanderwege",
    label: "Hiking trails",
    hint: "The official marked network",
    url: `${SWISSTOPO}/ch.swisstopo.swisstlm3d-wanderwege/default/current/3857/{z}/{x}/{y}.png`,
    attribution: SWISSTOPO_ATTRIB,
    maxZoom: 18,
    opacity: 0.85,
  },
  {
    id: "veloland",
    label: "Cycle routes",
    hint: "Signed national and regional routes",
    url: `${SWISSTOPO}/ch.astra.veloland/default/current/3857/{z}/{x}/{y}.png`,
    attribution: '&copy; <a href="https://www.astra.admin.ch">ASTRA</a>',
    maxZoom: 18,
    opacity: 0.85,
  },
  {
    id: "hangneigung",
    label: "Steep slope",
    hint: "Ground over 30°",
    url: `${SWISSTOPO}/ch.swisstopo.hangneigung-ueber_30/default/current/3857/{z}/{x}/{y}.png`,
    attribution: SWISSTOPO_ATTRIB,
    maxZoom: 18,
    opacity: 0.5,
  },
];

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
export function layersForRoute(route: LatLng[]): {
  layers: BaseMapLayer[];
  overlays: OverlayLayer[];
  swiss: boolean;
} {
  if (route.length === 0) return { layers: [OSM_LAYER], overlays: [], swiss: false };
  const inside = route.filter(isInSwitzerland).length;
  const swiss = inside / route.length > 0.5;
  // OSM stays available as a fallback even on Swiss routes: if swisstopo is
  // unreachable the athlete can still see where they ran.
  return swiss
    ? { layers: [...SWISS_LAYERS, OSM_LAYER], overlays: SWISS_OVERLAYS, swiss: true }
    : // The overlays are federal Swiss datasets; outside the country there is
      // nothing behind them, so offering the switch would be a lie.
      { layers: [OSM_LAYER], overlays: [], swiss: false };
}
