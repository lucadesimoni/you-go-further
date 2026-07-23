import { useEffect, useMemo, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { formatClock } from "../engine";
import type { Activity, LatLng } from "../model";

/**
 * Geographic route map — a real slippy map (Leaflet + OpenStreetMap data) of the
 * activity's GPS track, with the fuelling stops pinned along it, Tesla
 * trip-planner style. Open-source stack, no API key. The dark basemap is CARTO's
 * OSM-based "dark matter" tiles; swap TILE_URL for the standard OSM tiles if you
 * prefer the light community basemap or want to self-host for offline deploys.
 */
const TILE_URL = "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png";
const TILE_ATTRIB =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>';

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

  useEffect(() => {
    if (!el.current || !route || route.length < 2) return;
    const map = L.map(el.current, { zoomControl: true, attributionControl: true, scrollWheelZoom: false });
    L.tileLayer(TILE_URL, { maxZoom: 19, attribution: TILE_ATTRIB }).addTo(map);

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
  }, [route, cum, durationMin]);

  if (!route || route.length < 2) {
    return <p className="detail">No GPS track for this session (indoor or pool swim).</p>;
  }

  const km = activity.distanceM ? (activity.distanceM / 1000).toFixed(1) : "—";
  const stops = fuelStopMinutes(durationMin).length;
  return (
    <div className="route-wrap">
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
