import { useEffect, useMemo, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { formatClock } from "../engine";
import type { Activity, LatLng } from "../model";
import { layersForRoute, OSM_LAYER, type BaseMapLayer } from "../geo/basemap";

/**
 * Geographic route map — a real slippy map (Leaflet, no API key) of the
 * activity's GPS track with the fuelling stops pinned along it.
 *
 * Swiss routes are drawn on the **official swisstopo national map**, so the
 * athlete sees the same Landeskarte they already navigate by, and can switch to
 * the aerial or muted edition. Routes outside the swisstopo coverage fall back
 * to OpenStreetMap.
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

export function RouteMap({ activity }: { activity: Activity }) {
  const el = useRef<HTMLDivElement>(null);
  const route = activity.route;
  const durationMin = Math.round(activity.durationSec / 60);
  const cum = useMemo(() => (route ? trackLengthM(route) : []), [route]);

  // swisstopo for Swiss routes, OpenStreetMap elsewhere.
  const { layers, swiss } = useMemo(() => layersForRoute(route ?? []), [route]);
  const [layerId, setLayerId] = useState(layers[0]?.id);
  const layer: BaseMapLayer = layers.find((l) => l.id === layerId) ?? layers[0];

  // A route change can swap the whole layer set (Swiss ↔ elsewhere); keep the
  // selection valid rather than falling through to a layer that isn't offered.
  useEffect(() => {
    if (!layers.some((l) => l.id === layerId)) setLayerId(layers[0]?.id);
  }, [layers, layerId]);

  useEffect(() => {
    if (!el.current || !route || route.length < 2 || !layer) return;
    const map = L.map(el.current, { zoomControl: true, attributionControl: true, scrollWheelZoom: false });
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
      map.remove();
    };
  }, [route, cum, durationMin, layer]);

  if (!route || route.length < 2) {
    return <p className="detail">No GPS track for this session (indoor or pool swim).</p>;
  }

  const km = activity.distanceM ? (activity.distanceM / 1000).toFixed(1) : "—";
  const stops = fuelStopMinutes(durationMin).length;
  return (
    <div className="route-wrap">
      {layers.length > 1 && (
        <div className="map-layers" role="group" aria-label="Base map">
          {layers.map((l) => (
            <button
              key={l.id}
              type="button"
              className={`chip${l.id === layer?.id ? " chip-active" : ""}`}
              aria-pressed={l.id === layer?.id}
              onClick={() => setLayerId(l.id)}
            >
              {l.label}
            </button>
          ))}
          {swiss && <span className="map-source">swisstopo</span>}
        </div>
      )}
      <div ref={el} className="route-map" />
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
