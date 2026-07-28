import { useEffect, useState } from "react";
import type { LatLng } from "../model";
import type { Activity } from "../engine";
import { enrichRoute, type RouteConditions } from "../geo";
import { computeTarget, planRouteFuelling } from "../engine";
import { debriefSession, logForActivity } from "../analysis";
import { SessionDebrief } from "./SessionDebrief";
import type { SessionFeedback } from "../feedback";
import { loadProfile } from "../api/profileStore";
import { ElevationFuelChart } from "./ElevationFuelChart";
import type { SessionInput } from "./Planner";
import { useT } from "../i18n";

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
  hintDistanceKm,
  activityId,
  feedback = [],
  onLogSession,
  activity,
  durationMin,
  onPlan,
}: {
  route: LatLng[];
  hintGainM?: number;
  /** The session's recorded distance — more reliable than measuring the track. */
  hintDistanceKm?: number;
  /** The synced session this route belongs to, when it is a past run. */
  activityId?: string;
  /** The athlete's logs, so a past run can be held against what really happened. */
  feedback?: SessionFeedback[];
  onLogSession?: (
    activityId: string,
    entry: Pick<SessionFeedback, "gi" | "energy" | "actualCarbPerHourG"> & { durationMin: number; plannedCarbPerHourG: number },
  ) => Promise<void> | void;
  activity?: Activity;
  durationMin?: number;
  onPlan?: (prefill: Partial<SessionInput>) => void;
}) {
  const t = useT();
  const [data, setData] = useState<RouteConditions | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let live = true;
    setLoading(true);
    enrichRoute(route, hintGainM, hintDistanceKm)
      .then((d) => live && setData(d))
      .catch(() => live && setData(null))
      .finally(() => live && setLoading(false));
    return () => {
      live = false;
    };
  }, [route, hintGainM, hintDistanceKm]);

  if (loading) return <p className="detail geo-loading">Loading terrain &amp; weather…</p>;
  if (!data) return null;
  const { terrain, weather, implications } = data;

  // Fuelling placed by the height profile. The carbohydrate target comes from
  // the same engine the planner uses, with the route's own conditions applied,
  // so the chart and the plan can never disagree.
  const bodyProfile = loadProfile();
  const target = computeTarget({
    goal: "endurance-performance",
    activity: activity ?? "trail-running",
    durationMin: durationMin ?? Math.round(terrain.distanceKm * 6),
    intensity: "moderate",
    bodyWeightKg: bodyProfile.bodyWeightKg,
    conditions: weather.conditions,
    sweatLevel: bodyProfile.sweatLevel,
  });
  const sessionInput = {
    goal: "endurance-performance" as const,
    activity: activity ?? ("trail-running" as const),
    durationMin: durationMin ?? Math.round(terrain.distanceKm * 6),
    intensity: "moderate" as const,
    bodyWeightKg: bodyProfile.bodyWeightKg,
    conditions: weather.conditions,
    sweatLevel: bodyProfile.sweatLevel,
  };
  const fuelPlan = planRouteFuelling({
    samples: terrain.samples,
    activity,
    durationMin,
    carbPerHourG: target.carbPerHourG,
    // With the session and target in hand, every stop can name a real product.
    input: sessionInput,
    target,
  });

  // A past run can be held against what the athlete says actually happened.
  const log = activityId ? logForActivity(feedback, activityId) : undefined;
  const debrief = activityId
    ? debriefSession({
        plan: fuelPlan,
        requiredCarbPerHourG: target.carbPerHourG,
        log,
        durationMin: durationMin ?? sessionInput.durationMin,
      })
    : null;

  return (
    <div className="geo">
      <div className="geo-cols">
        <div className="geo-block">
          <div className="geo-head">
            <span className="geo-title">{t("connect.terrain")}</span>
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
            <span className="geo-title">{t("connect.weather")}</span>
            {/* Say which of the three sources this actually is — a measured
                station, a model, or a guess — and where it came from. */}
            <span
              className={`geo-src geo-src-${weather.source === "estimated" ? "estimated" : "swisstopo"}`}
              title={weather.sourceLabel}
            >
              {weather.source === "station" ? "MeteoSwiss station" : weather.source === "forecast" ? "ICON-CH model" : "estimated"}
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
          <p className="geo-source-note">{weather.sourceLabel}</p>
        </div>
      </div>

      {/* The debrief comes first for a past run: "how did that go?" is the
          question the athlete actually has, and answering it is what makes the
          plan below meaningful. */}
      {debrief && activityId && (
        <SessionDebrief
          debrief={debrief}
          plan={fuelPlan}
          saving={saving}
          onLog={
            onLogSession
              ? async (entry) => {
                  setSaving(true);
                  try {
                    await onLogSession(activityId, {
                      ...entry,
                      durationMin: durationMin ?? sessionInput.durationMin,
                      plannedCarbPerHourG: target.carbPerHourG,
                    });
                  } finally {
                    setSaving(false);
                  }
                }
              : undefined
          }
        />
      )}

      {fuelPlan.stops.length > 0 && (
        <div className="route-fuel">
          <div className="route-fuel-head">
            {/* Same stops, different question: on a reviewed past run this list
                is the answer to "what should I have taken?". */}
            <h4 className="geo-title">{debrief?.hasLog ? t("debrief.whereToTake") : t("route.fuelByTerrain")}</h4>
            <span className="pill">{fuelPlan.climbs.length > 0 ? t("route.byTerrain") : t("route.evenSpacing")}</span>
          </div>
          <ElevationFuelChart plan={fuelPlan} estimated={terrain.source === "estimated"} />
          <p className="detail elev-note">{t("route.explain")}</p>
        </div>
      )}

      {implications.length > 0 && (
        <ul className="geo-implications">
          {implications.map((line, i) => (
            <li key={i}>{line}</li>
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
          {t("connect.planRoute")}
        </button>
      )}
    </div>
  );
}
