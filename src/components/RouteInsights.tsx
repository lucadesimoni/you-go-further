import { useEffect, useState } from "react";
import type { LatLng } from "../model";
import type { Activity } from "../engine";
import { enrichRoute, type RouteConditions } from "../geo";
import type { SessionInput } from "./Planner";

const TERRAIN_LABEL: Record<string, string> = {
  flat: "Flat",
  rolling: "Rolling",
  hilly: "Hilly",
  mountainous: "Mountainous",
};

/**
 * Terrain (swisstopo) + weather for a planned/recorded route, and how they
 * change the fuelling plan. Fetches on mount; both sources fall back to an
 * estimate offline. "Plan for this route" carries the derived conditions (and
 * the route's activity + duration) straight into the planner.
 */
export function RouteInsights({
  route,
  hintGainM,
  activity,
  durationMin,
  onPlan,
}: {
  route: LatLng[];
  hintGainM?: number;
  activity?: Activity;
  durationMin?: number;
  onPlan?: (prefill: Partial<SessionInput>) => void;
}) {
  const [data, setData] = useState<RouteConditions | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let live = true;
    setLoading(true);
    enrichRoute(route, hintGainM)
      .then((d) => live && setData(d))
      .catch(() => live && setData(null))
      .finally(() => live && setLoading(false));
    return () => {
      live = false;
    };
  }, [route, hintGainM]);

  if (loading) return <p className="detail geo-loading">Loading terrain &amp; weather…</p>;
  if (!data) return null;
  const { terrain, weather, implications } = data;

  return (
    <div className="geo">
      <div className="geo-cols">
        <div className="geo-block">
          <div className="geo-head">
            <span className="geo-title">Terrain</span>
            <span className={`geo-src geo-src-${terrain.source}`}>
              {terrain.source === "swisstopo" ? "swisstopo" : "estimated"}
            </span>
          </div>
          <div className="geo-stats">
            <div className="stat">
              <span className="stat-value">{TERRAIN_LABEL[terrain.terrain]}</span>
              <span className="stat-label">Profile</span>
            </div>
            <div className="stat">
              <span className="stat-value">↑ {terrain.ascentM} m</span>
              <span className="stat-label">Ascent</span>
            </div>
            <div className="stat">
              <span className="stat-value">{terrain.maxAltM} m</span>
              <span className="stat-label">High point</span>
            </div>
          </div>
        </div>

        <div className="geo-block">
          <div className="geo-head">
            <span className="geo-title">Weather</span>
            <span className={`geo-src geo-src-${weather.source === "meteoswiss" ? "swisstopo" : "estimated"}`}>
              {weather.source === "meteoswiss" ? "MeteoSwiss" : "estimated"}
            </span>
          </div>
          <div className="geo-stats">
            <div className="stat">
              <span className="stat-value">{weather.temperatureC}°C</span>
              <span className="stat-label">{weather.conditions}</span>
            </div>
            <div className="stat">
              <span className="stat-value">{weather.humidityPct}%</span>
              <span className="stat-label">Humidity</span>
            </div>
            <div className="stat">
              <span className="stat-value">{weather.windKmh} km/h</span>
              <span className="stat-label">Wind</span>
            </div>
          </div>
        </div>
      </div>

      {implications.length > 0 && (
        <ul className="geo-implications">
          {implications.map((t, i) => (
            <li key={i}>{t}</li>
          ))}
        </ul>
      )}

      {onPlan && (
        <button
          type="button"
          className="btn btn-primary geo-plan"
          onClick={() =>
            onPlan({
              ...(activity ? { activity } : {}),
              ...(durationMin ? { durationMin } : {}),
              conditions: weather.conditions,
            })
          }
        >
          Plan for this route →
        </button>
      )}
    </div>
  );
}
