import { useEffect, useMemo, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { formatClock } from "../engine";
import type { Activity, LatLng } from "../model";
import { layersForRoute, OSM_LAYER, type BaseMapLayer, type OverlayLayer } from "../geo/basemap";
import { useT } from "../i18n";

/**
 * Geographic route map — a real slippy map (Leaflet, no API key) of the
 * activity's GPS track with the fuelling stops pinned along it.
 *
 * Swiss routes are drawn on the **official swisstopo national map**, so the
 * athlete sees the same Landeskarte they already navigate by, and can switch to
 * the aerial or muted edition or stack the federal overlays — marked hiking
 * trails, signed cycle routes, ground over 30° — on top of it.
 *
 * The map and the height profile below it are two views of one route, so they
 * share a cursor: `hoverKm` puts a marker on the track, and moving the pointer
 * over the track reports the distance back so the profile can follow.
 */

/** Total metres along a [lat,lng] track (equirectangular approximation). */
function trackLengthM(route: LatLng[]): number[] {
  const cum = [0];
  for (let i = 1; i < route.length; i++) {
    const [la1, lo1] = route[i - 1];
    const [la2, lo2] = route[i];
    const mLat = (la2 - la1) * 111_320;
    const mLng = (lo2 - lo1) * 111_320 * Math.cos((la1 * Math.PI) / 180);
    cum.push(cum[i - 1] + Math.hypot(mLat, mLng));
  }
  return cum;
}

/** Interpolate the point at a given fraction (0–1) of the track's length. */
function pointAtFraction(route: LatLng[], cum: number[], f: number): LatLng {
  const target = f * cum[cum.length - 1];
  for (let i = 1; i < cum.length; i++) {
    if (cum[i] >= target) {
      const seg = cum[i] - cum[i - 1] || 1;
      const t = (target - cum[i - 1]) / seg;
      const [la1, lo1] = route[i - 1];
      const [la2, lo2] = route[i];
      return [la1 + (la2 - la1) * t, lo1 + (lo2 - lo1) * t];
    }
  }
  return route[route.length - 1];
}

/** Fuel-stop times (minutes) across a session: every ~40 min once past an hour. */
function fuelStopMinutes(durationMin: number): number[] {
  if (durationMin < 60) return [];
  const stops: number[] = [];
  for (let t = 40; t < durationMin - 5; t += 40) stops.push(t);
  return stops;
}

function dotIcon(className: string, label: string): L.DivIcon {
  return L.divIcon({ className: "", html: `<span class="map-pin ${className}">${label}</span>`, iconSize: [1, 1] });
}

export function RouteMap({
  activity,
  hoverKm,
  onHoverKm,
}: {
  activity: Activity;
  /** Distance along the route to mark, kept in step with the height profile. */
  hoverKm?: number | null;
  /** Report where the pointer is on the track, so the profile can follow. */
  onHoverKm?: (km: number | null) => void;
}) {
  const t = useT();
  const el = useRef<HTMLDivElement>(null);
  const route = activity.route;
  const durationMin = Math.round(activity.durationSec / 60);
  const cum = useMemo(() => (route ? trackLengthM(route) : []), [route]);

  // swisstopo for Swiss routes, OpenStreetMap elsewhere.
  const { layers, overlays, swiss } = useMemo(() => layersForRoute(route ?? []), [route]);
  const [layerId, setLayerId] = useState(layers[0]?.id);
  const [activeOverlays, setActiveOverlays] = useState<string[]>([]);
  /** Overlays the tile service would not serve — reported, not silently hidden. */
  const [unavailable, setUnavailable] = useState<string[]>([]);
  const [switcherOpen, setSwitcherOpen] = useState(false);
  const layer: BaseMapLayer = layers.find((l) => l.id === layerId) ?? layers[0];

  // A route change can swap the whole layer set (Swiss ↔ elsewhere); keep the
  // selection valid rather than falling through to a layer that isn't offered.
  useEffect(() => {
    if (!layers.some((l) => l.id === layerId)) setLayerId(layers[0]?.id);
  }, [layers, layerId]);

  // The map instance and the hover marker outlive any single render, so they
  // are refs rather than state: moving the cursor must not rebuild the map.
  const mapRef = useRef<L.Map | null>(null);
  const cursorRef = useRef<L.Marker | null>(null);
  const overlayRefs = useRef<Record<string, L.TileLayer>>({});
  // Read inside the map's event handlers, which are bound once. Without this
  // they would close over the first render's callback for ever.
  const onHoverRef = useRef(onHoverKm);
  onHoverRef.current = onHoverKm;

  useEffect(() => {
    if (!el.current || !route || route.length < 2 || !layer) return;
    const map = L.map(el.current, { zoomControl: true, attributionControl: true, scrollWheelZoom: false });
    mapRef.current = map;
    const tiles = L.tileLayer(layer.url, { maxZoom: layer.maxZoom, attribution: layer.attribution }).addTo(map);
    // If swisstopo can't be reached, show the athlete their route on OSM rather
    // than an empty grey box.
    let fellBack = false;
    tiles.on("tileerror", () => {
      if (fellBack || layer.id === OSM_LAYER.id) return;
      fellBack = true;
      map.removeLayer(tiles);
      L.tileLayer(OSM_LAYER.url, { maxZoom: OSM_LAYER.maxZoom, attribution: OSM_LAYER.attribution }).addTo(map);
    });

    const line = L.polyline(route as L.LatLngExpression[], { color: "#e4002b", weight: 4, opacity: 0.95 }).addTo(map);
    map.fitBounds(line.getBounds(), { padding: [26, 26] });

    L.marker(route[0], { icon: dotIcon("start", "Start"), interactive: false }).addTo(map);
    L.marker(route[route.length - 1], { icon: dotIcon("finish", "Finish"), interactive: false }).addTo(map);

    fuelStopMinutes(durationMin).forEach((min, i) => {
      const at = pointAtFraction(route, cum, min / durationMin);
      L.marker(at, { icon: dotIcon("fuel", `⚡ ${i + 1}`) })
        .addTo(map)
        .bindTooltip(`Fuel stop ${i + 1} · ${formatClock(min)} · ~30 g carb`, { direction: "top" });
    });

    /**
     * Where along the route the pointer is.
     *
     * Nearest vertex rather than nearest point on a segment: at any zoom where
     * a person can aim at the line, the vertices are closer together than the
     * pointer is accurate, and the exact projection costs more than it buys.
     */
    const totalM = cum[cum.length - 1] || 1;
    const nearestKm = (latlng: L.LatLng): number => {
      let best = 0;
      let bestD = Infinity;
      for (let i = 0; i < route.length; i++) {
        const d = map.distance(latlng, route[i] as L.LatLngExpression);
        if (d < bestD) {
          bestD = d;
          best = i;
        }
      }
      // Ignore a pointer that is nowhere near the track — otherwise the cursor
      // jumps to a random kilometre whenever the mouse crosses the map.
      const tolerance = Math.max(60, totalM / 200);
      return bestD > tolerance ? -1 : cum[best] / 1000;
    };

    map.on("mousemove", (e: L.LeafletMouseEvent) => {
      const km = nearestKm(e.latlng);
      onHoverRef.current?.(km < 0 ? null : km);
    });
    map.on("mouseout", () => onHoverRef.current?.(null));

    // Leaflet mis-sizes tiles when its container isn't laid out yet (lazy mount,
    // freshly-rendered panel). Recalculate size + refit once the box has real
    // dimensions, and again on any later resize, so the map always fills in.
    const refit = () => {
      map.invalidateSize();
      if (line.getBounds().isValid()) map.fitBounds(line.getBounds(), { padding: [26, 26] });
    };
    const t1 = setTimeout(refit, 60);
    const t2 = setTimeout(refit, 350);
    const ro = new ResizeObserver(() => map.invalidateSize());
    if (el.current) ro.observe(el.current);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      ro.disconnect();
      cursorRef.current = null;
      overlayRefs.current = {};
      mapRef.current = null;
      map.remove();
    };
  }, [route, cum, durationMin, layer]);

  /**
   * Add and remove overlay tiles without touching the base map.
   *
   * An overlay whose tiles the service refuses is switched off and named. The
   * layer identifiers here could not be checked against the live service from
   * this repository's sandbox, and a renamed layer five years from now would
   * otherwise show as nothing happening when the box is ticked.
   */
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    for (const o of overlays) {
      const on = activeOverlays.includes(o.id);
      const existing = overlayRefs.current[o.id];
      if (on && !existing) {
        const tile = L.tileLayer(o.url, {
          maxZoom: o.maxZoom,
          attribution: o.attribution,
          opacity: o.opacity,
          // Above the base map, below the route line and the pins.
          pane: "overlayPane",
        }).addTo(map);
        let failures = 0;
        tile.on("tileerror", () => {
          // One missing tile at the edge of coverage is normal; a layer that is
          // not there fails on every tile in view.
          if (++failures < 4) return;
          setUnavailable((prev) => (prev.includes(o.id) ? prev : [...prev, o.id]));
          setActiveOverlays((prev) => prev.filter((id) => id !== o.id));
        });
        overlayRefs.current[o.id] = tile;
      } else if (!on && existing) {
        map.removeLayer(existing);
        delete overlayRefs.current[o.id];
      }
    }
  }, [activeOverlays, overlays, layer]);

  /** Follow the profile's cursor with a marker on the track. */
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !route || route.length < 2) return;
    const totalKm = (cum[cum.length - 1] || 0) / 1000;
    if (hoverKm == null || totalKm === 0) {
      if (cursorRef.current) {
        map.removeLayer(cursorRef.current);
        cursorRef.current = null;
      }
      return;
    }
    const at = pointAtFraction(route, cum, Math.min(1, Math.max(0, hoverKm / totalKm)));
    if (cursorRef.current) cursorRef.current.setLatLng(at);
    else {
      cursorRef.current = L.marker(at, {
        icon: L.divIcon({ className: "", html: '<span class="map-cursor"></span>', iconSize: [1, 1] }),
        interactive: false,
        keyboard: false,
        zIndexOffset: 1000,
      }).addTo(map);
    }
  }, [hoverKm, route, cum]);

  if (!route || route.length < 2) {
    return <p className="detail">{t("map.noTrack")}</p>;
  }

  const km = activity.distanceM ? (activity.distanceM / 1000).toFixed(1) : "—";
  const stops = fuelStopMinutes(durationMin).length;
  const toggleOverlay = (id: string) =>
    setActiveOverlays((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  return (
    <div className="route-wrap">
      <div className="route-map-frame">
        <div ref={el} className="route-map" />

        {/* The layer switcher sits on the map, the way every map does it:
            collapsed to one button until it is wanted, so it costs a corner of
            the picture rather than a row above it. */}
        {(layers.length > 1 || overlays.length > 0) && (
          <div
            className={switcherOpen ? "map-switcher open" : "map-switcher"}
            onMouseLeave={() => setSwitcherOpen(false)}
          >
            <button
              type="button"
              className="map-switcher-toggle"
              aria-expanded={switcherOpen}
              // Click-only, deliberately. Opening on hover *and* toggling on
              // click means the hover opens it and the click that follows
              // closes it again — the control never opens for a mouse user.
              onClick={() => setSwitcherOpen((v) => !v)}
            >
              <LayersGlyph />
              <span>{t("map.layers")}</span>
            </button>

            {switcherOpen && (
              <div className="map-switcher-body">
                <fieldset className="map-switcher-group">
                  <legend>{t("map.baseMap")}</legend>
                  {layers.map((l) => (
                    <label key={l.id} className={l.id === layer?.id ? "map-opt on" : "map-opt"}>
                      <input
                        type="radio"
                        name="basemap"
                        checked={l.id === layer?.id}
                        onChange={() => setLayerId(l.id)}
                      />
                      <span className="map-opt-label">{l.label}</span>
                    </label>
                  ))}
                </fieldset>

                {overlays.length > 0 && (
                  <fieldset className="map-switcher-group">
                    <legend>{t("map.overlays")}</legend>
                    {overlays.map((o: OverlayLayer) => {
                      const gone = unavailable.includes(o.id);
                      return (
                        <label key={o.id} className={activeOverlays.includes(o.id) ? "map-opt on" : "map-opt"}>
                          <input
                            type="checkbox"
                            checked={activeOverlays.includes(o.id)}
                            disabled={gone}
                            onChange={() => toggleOverlay(o.id)}
                          />
                          <span className="map-opt-label">
                            {o.label}
                            <span className="map-opt-hint">{gone ? t("map.layerUnavailable") : o.hint}</span>
                          </span>
                        </label>
                      );
                    })}
                  </fieldset>
                )}
                {swiss && <p className="map-switcher-source">swisstopo · ASTRA</p>}
              </div>
            )}
          </div>
        )}
      </div>

      <div className="energy-foot">
        <span>{activity.name ?? activity.sport}</span>
        <span>{km} km</span>
        {activity.elevationGainM ? <span>↑ {activity.elevationGainM} m</span> : null}
        <span>{formatClock(durationMin)}</span>
        <span className="energy-reserve">
          {stops} fuel stop{stops === 1 ? "" : "s"} on route
        </span>
      </div>
    </div>
  );
}

/** Stacked sheets — the symbol every map uses for its layer control. */
function LayersGlyph() {
  return (
    <svg viewBox="0 0 24 24" className="icon" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" aria-hidden>
      <path d="M12 3 21 8l-9 5-9-5z" />
      <path d="M3 13l9 5 9-5" />
    </svg>
  );
}
