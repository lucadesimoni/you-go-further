import { useEffect, useState } from "react";
import { useMediaQuery, PHONE } from "../ui/useMediaQuery";
import type { LatLng } from "../model";
import type { Activity } from "../engine";
import { enrichRoute, type RouteConditions } from "../geo";
import { computeTarget, planRouteFuelling, simulateRace } from "../engine";
import { debriefSession, logForActivity } from "../analysis";
import { SessionDebrief } from "./SessionDebrief";
import type { SessionFeedback } from "../feedback";
import { loadProfile } from "../api/profileStore";
import { ElevationFuelChart } from "./ElevationFuelChart";
import { RaceForecast } from "./RaceForecast";
import type { SessionInput } from "./Planner";
import { useT } from "../i18n";
import { Explain } from "./Explain";

/** Terrain bands, translated at the call site rather than baked in English. */
const TERRAIN_KEY = {
  flat: "terrain.flat",
  rolling: "terrain.rolling",
  hilly: "terrain.hilly",
  mountainous: "terrain.mountainous",
} as const;

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
  hoverKm,
  onHoverKm,
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
  /** Shared with the map above: one cursor across both views of the route. */
  hoverKm?: number | null;
  onHoverKm?: (km: number | null) => void;
}) {
  const t = useT();
  const isPhone = useMediaQuery(PHONE);
  const [data, setData] = useState<RouteConditions | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  /**
   * Which route the numbers on screen belong to.
   *
   * Effects run *after* React paints, so switching session produced one frame
   * in which the summary above had already changed while this panel still drew
   * the previous route: an 11.6 km run captioned with 14 km of terrain. It is
   * brief, and it is exactly the kind of contradiction that makes an athlete
   * stop believing the numbers. Resetting during render instead of in the
   * effect means the stale frame cannot be drawn at all.
   */
  const routeKey = `${activityId ?? ""}|${hintDistanceKm ?? ""}|${route.length}|${route[0]?.join(",") ?? ""}`;
  const [shownFor, setShownFor] = useState(routeKey);
  if (shownFor !== routeKey) {
    setShownFor(routeKey);
    setData(null);
    setLoading(true);
  }

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

  if (loading) return <p className="detail geo-loading">{t("route.loading")}</p>;
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

  // The same course, run forward: where the tank actually runs down, with this
  // plan and without it. Below about an hour and a quarter the answer is always
  // "you had enough glycogen anyway", which is not worth a panel.
  const sim =
    fuelPlan.estimatedMin >= 75 && fuelPlan.segments.length >= 2
      ? simulateRace({
          plan: fuelPlan,
          bodyWeightKg: bodyProfile.bodyWeightKg,
          intensity: sessionInput.intensity,
          fluidPerHourMl: target.fluidPerHourMl,
          sodiumPerLitreMg: target.sodiumPerLitreMg,
          temperatureC: weather.temperatureC,
          humidityPct: weather.humidityPct,
          sweatLevel: bodyProfile.sweatLevel,
          // Only a profile the athlete has actually told us to use counts as a
          // measurement; the defaults are population figures wearing a number.
          ...(bodyProfile.useSignals
            ? {
                measuredSweatRateMlPerH: bodyProfile.sweatRateMlPerH,
                measuredSweatSodiumMgPerL: bodyProfile.sweatSodiumMgPerL,
              }
            : {}),
        })
      : null;

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
              <span className="stat-value">{t(TERRAIN_KEY[terrain.terrain as keyof typeof TERRAIN_KEY])}</span>
              <span className="stat-label">{t("route.profile")}</span>
            </div>
            <div className="stat">
              <span className="stat-value">↑ {terrain.ascentM} m</span>
              <span className="stat-label">{t("route.ascent")}</span>
            </div>
            <div className="stat">
              <span className="stat-value">{terrain.maxAltM} m</span>
              <span className="stat-label">{t("route.highPoint")}</span>
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
              <span className="stat-label">{t("route.humidity")}</span>
            </div>
            <div className="stat">
              <span className="stat-value">{weather.windKmh} km/h</span>
              <span className="stat-label">{t("route.wind")}</span>
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
          {/* The measured samples, not the fuelling segments: segments are the
              handful of units the engine reasons in, and drawing a marathon
              from them gave a dozen straight lines instead of a profile. */}
          <ElevationFuelChart
            plan={fuelPlan}
            samples={terrain.samples}
            estimated={terrain.source === "estimated"}
            hoverKm={hoverKm}
            onHoverKm={onHoverKm}
          />
          {/* The physiology behind where the stops sit: worth being able to
              read, not worth reading past every time. */}
          <Explain>
            <p>{t("route.explain")}</p>
          </Explain>
        </div>
      )}

      {/*
        Where the plan holds and where it doesn't — the question behind the stop
        list, answered in kilometres. It is 729 px of it, though, and on a phone
        it sat between the athlete and everything below: the stop list above is
        the answer, this is the follow-up question. Folded there, open here.
      */}
      {sim &&
        (isPhone ? (
          <details className="panel fold">
            <summary className="fold-summary">{t("sim.title")}</summary>
            <RaceForecast sim={sim} estimated={terrain.source === "estimated"} />
          </details>
        ) : (
          <RaceForecast sim={sim} estimated={terrain.source === "estimated"} />
        ))}

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
