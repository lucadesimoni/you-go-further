import { lazy, Suspense, useRef, useState } from "react";
import type { Activity as SyncedActivity, LatLng, SportType } from "../model";
import type { Activity } from "../engine";
import { parseGpx, estimateDurationMin, type GpxRoute } from "../geo/gpx";
import { formatClock } from "../engine";
import { RouteInsights } from "./RouteInsights";
import type { SessionInput } from "./Planner";
import { useT } from "../i18n";

const RouteMap = lazy(() => import("./RouteMap").then((m) => ({ default: m.RouteMap })));

/** Sports we plan for at launch — running, trail and triathlon. */
const KINDS: { value: Activity; paceMinPerKm: number }[] = [
  { value: "running", paceMinPerKm: 5.5 },
  { value: "trail-running", paceMinPerKm: 7 },
  { value: "triathlon", paceMinPerKm: 5 },
  { value: "cycling", paceMinPerKm: 2 },
];

/**
 * Import a race or a planned route and get its fuelling plan — before running it.
 *
 * Until now every plan was derived from a session already in the past. That
 * covers training, but the moment an athlete actually needs this is the week
 * before a race they have never run: how much, how often, and *where* on a
 * course they only know as a GPX from the organiser's site.
 *
 * The file never leaves the device — it is parsed in the browser and only the
 * resulting line is sent on for terrain and weather.
 */
export function RaceImport({ onPlan }: { onPlan?: (prefill: Partial<SessionInput>) => void }) {
  const t = useT();
  const fileRef = useRef<HTMLInputElement>(null);
  const [route, setRoute] = useState<GpxRoute | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [kind, setKind] = useState<Activity>("trail-running");
  const [pace, setPace] = useState(7);
  const [durationMin, setDurationMin] = useState(0);
  const [dragging, setDragging] = useState(false);

  const load = async (file: File) => {
    setError(null);
    if (file.size > 8 * 1024 * 1024) {
      setError(t("race.tooBig"));
      return;
    }
    const parsed = parseGpx(await file.text());
    if (!parsed) {
      setError(t("race.noRoute"));
      return;
    }
    setRoute(parsed);
    // A first, honest estimate the athlete then corrects — the plan is far more
    // sensitive to duration than to which pace model produced it.
    setDurationMin(estimateDurationMin(parsed.distanceKm, parsed.ascentM ?? 0, pace, kind === "cycling" ? "ride" : "run"));
  };

  const reEstimate = (nextPace: number, nextKind: Activity) => {
    if (!route) return;
    setDurationMin(
      estimateDurationMin(route.distanceKm, route.ascentM ?? 0, nextPace, nextKind === "cycling" ? "ride" : "run"),
    );
  };

  const points: LatLng[] = route?.points ?? [];

  return (
    <section className="panel race">
      <div className="section-head">
        <h2>{t("race.title")}</h2>
        {route && (
          <button type="button" className="link-btn" onClick={() => { setRoute(null); setError(null); }}>
            {t("race.another")}
          </button>
        )}
      </div>

      {!route && (
        <>
          <p className="detail">{t("race.intro")}</p>
          <div
            className={`race-drop${dragging ? " race-drop-over" : ""}`}
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragging(false);
              const f = e.dataTransfer.files[0];
              if (f) void load(f);
            }}
          >
            <p className="race-drop-title">{t("race.drop")}</p>
            <button type="button" className="btn btn-primary" onClick={() => fileRef.current?.click()}>
              {t("race.choose")}
            </button>
            <input
              ref={fileRef}
              type="file"
              accept=".gpx,application/gpx+xml,application/xml,text/xml"
              className="race-file"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void load(f);
                e.target.value = "";
              }}
            />
            <p className="detail race-privacy">{t("race.privacy")}</p>
          </div>
          {error && <p className="race-error">{error}</p>}
        </>
      )}

      {route && (
        <>
          <div className="race-head">
            <h3 className="race-name">{route.name ?? t("race.unnamed")}</h3>
            <span className="race-figs">
              {route.distanceKm} km
              {route.ascentM !== undefined ? ` · ↑ ${route.ascentM} m` : ""} · {formatClock(durationMin)}
            </span>
          </div>

          <div className="race-controls">
            <div className="field">
              <label htmlFor="race-kind">{t("plan.activity")}</label>
              <select
                id="race-kind"
                value={kind}
                onChange={(e) => {
                  const next = e.target.value as Activity;
                  const p = KINDS.find((k) => k.value === next)?.paceMinPerKm ?? pace;
                  setKind(next);
                  setPace(p);
                  reEstimate(p, next);
                }}
              >
                {KINDS.map((k) => (
                  <option key={k.value} value={k.value}>
                    {t(`activity.${k.value}` as never)}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="race-duration">
                {t("race.finishTime")} <span className="value">{formatClock(durationMin)}</span>
              </label>
              <input
                id="race-duration"
                type="range"
                min={20}
                max={900}
                step={5}
                value={durationMin}
                onChange={(e) => setDurationMin(Number(e.target.value))}
              />
              <p className="detail">{t("race.estimateNote")}</p>
            </div>
          </div>

          {/* The map draws a synced session; an imported course is the same
              shape, so it is presented as one rather than duplicating the map. */}
          <Suspense fallback={<p className="detail">{t("race.loadingMap")}</p>}>
            <RouteMap activity={asActivity(route, kind, durationMin)} />
          </Suspense>

          <RouteInsights
            key={`${points.length}-${durationMin}-${kind}`}
            route={points}
            hintGainM={route.ascentM}
            hintDistanceKm={route.distanceKm}
            activity={kind}
            durationMin={durationMin}
            onPlan={onPlan}
          />
        </>
      )}
    </section>
  );
}

const SPORT: Record<string, SportType> = {
  running: "run",
  "trail-running": "trail-run",
  cycling: "ride",
  triathlon: "triathlon",
  swimming: "swim",
};

/** Present an imported course as the session it is about to become. */
function asActivity(route: GpxRoute, kind: Activity, durationMin: number): SyncedActivity {
  return {
    id: "imported-route",
    provider: "strava",
    externalId: "imported",
    sport: SPORT[kind] ?? "other",
    startTime: new Date().toISOString(),
    durationSec: durationMin * 60,
    distanceM: Math.round(route.distanceKm * 1000),
    ...(route.ascentM !== undefined ? { elevationGainM: route.ascentM } : {}),
    route: route.points,
  };
}
