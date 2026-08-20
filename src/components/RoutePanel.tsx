import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import type { Activity as SyncedActivity } from "../model";
import type { SessionFeedback } from "../feedback";
import { debriefSession, logForActivity, sportToActivity } from "../analysis";
import { computeTarget } from "../engine";
import { loadProfile } from "../api/profileStore";
import { SessionDebrief } from "./SessionDebrief";
import { RouteInsights } from "./RouteInsights";
import { RaceImport } from "./RaceImport";
import { ChoiceRow } from "./Choice";
import type { SessionInput } from "./Planner";
import { useI18n, type TranslationKey } from "../i18n";

// Code-split: Leaflet (~150 KB) loads only when a route map is actually shown.
const RouteMap = lazy(() => import("./RouteMap").then((m) => ({ default: m.RouteMap })));

/**
 * A route, and how to fuel it.
 *
 * This used to live at the bottom of Connect, under the provider cards and the
 * body-signal tiles — three panels below the screen an athlete opens to link
 * Strava. Connect is a settings screen: it answers "which services am I linked
 * to". A route is not a setting, it is a thing you plan, so it belongs on Plan
 * beside the race and the session.
 *
 * Two sources, one view: a session already synced from a watch, or a GPX from
 * a race organiser. Both produce the same map, the same height profile and the
 * same fuelling plan, so they are two answers to "which route" rather than two
 * features.
 */

/**
 * Sport names for the picker — the same translated names the start screen uses,
 * so a session called "Trail running" there isn't "Trail run" here.
 */
const SPORT_KEY: Record<string, TranslationKey> = {
  run: "activity.running",
  "trail-run": "activity.trail-running",
  ride: "activity.cycling",
  swim: "activity.swimming",
  triathlon: "activity.triathlon",
};

type Source = "synced" | "import";

export function RoutePanel({
  activities,
  feedback = [],
  onLogSession,
  focusActivityId,
  onPlan,
}: {
  activities: SyncedActivity[];
  feedback?: SessionFeedback[];
  onLogSession?: (
    activityId: string,
    entry: Pick<SessionFeedback, "gi" | "energy" | "actualCarbPerHourG"> & {
      durationMin: number;
      plannedCarbPerHourG: number;
    },
  ) => Promise<void> | void;
  /** Open straight on one session — e.g. "How did it go?" from the start screen. */
  focusActivityId?: string;
  onPlan?: (prefill: Partial<SessionInput>) => void;
}) {
  const { t, lang } = useI18n();

  /**
   * Sessions with a GPS track, offered as a picker.
   *
   * Simply taking the newest few would often show an athlete four bike rides and
   * no run, so the most recent session of *each* sport is seeded first and the
   * remaining slots are filled with the newest others. That guarantees a runner
   * sees a run.
   */
  const routed = useMemo(() => {
    const withRoute = [...activities]
      .filter((a) => a.route && a.route.length > 1)
      .sort((a, b) => Date.parse(b.startTime) - Date.parse(a.startTime));
    const picked: typeof withRoute = [];
    const seenSport = new Set<string>();
    for (const a of withRoute) {
      if (seenSport.has(a.sport)) continue;
      seenSport.add(a.sport);
      picked.push(a);
    }
    for (const a of withRoute) {
      if (picked.length >= 6) break;
      if (!picked.includes(a)) picked.push(a);
    }
    return picked.sort((a, b) => Date.parse(b.startTime) - Date.parse(a.startTime));
  }, [activities]);

  const [source, setSource] = useState<Source>(routed.length > 0 ? "synced" : "import");
  const [routeId, setRouteId] = useState<string | null>(null);

  /**
   * The cursor both views share.
   *
   * A map and a height profile of the same route are two projections of one
   * line, and reading them separately is the work the athlete should not have
   * to do — "where is that climb, actually?" is answered by pointing at one and
   * seeing the other move. The state lives here because it belongs to neither.
   */
  const [hoverKm, setHoverKm] = useState<number | null>(null);

  // Arriving from "How did it go?" on the start screen: open that session.
  useEffect(() => {
    if (!focusActivityId) return;
    setRouteId(focusActivityId);
    setSource("synced");
  }, [focusActivityId]);

  const activity = routed.find((a) => a.id === routeId) ?? routed[0] ?? null;

  /*
   * The session sent here by "How did it go?" that has no GPS track.
   *
   * `routed` is filtered to activities carrying a route, so before this a
   * track-less session arrived and found nothing — which is why Home refused to
   * offer the debrief for one at all, and why an athlete who runs without GPS
   * met an anonymous rating form on the *planner* instead. A track is what the
   * map and the terrain plan need; it is not what judging a session needs.
   */
  const trackless = useMemo(() => {
    if (!focusActivityId) return null;
    const a = activities.find((x) => x.id === focusActivityId);
    return a && !(a.route && a.route.length > 1) ? a : null;
  }, [activities, focusActivityId]);

  const tracklessDebrief = useMemo(() => {
    if (!trackless) return null;
    const durationMin = Math.round(trackless.durationSec / 60);
    const profile = loadProfile();
    // The same target the planner would compute for this session's shape, so
    // the athlete is held to one number rather than two.
    const target = computeTarget({
      goal: "endurance-performance",
      activity: sportToActivity(trackless.sport),
      durationMin,
      // A recorded training session with no other signal: moderate effort in
      // temperate conditions is the honest middle, and the athlete's own log is
      // what the verdict actually leans on.
      intensity: "moderate",
      conditions: "temperate",
      bodyWeightKg: profile.bodyWeightKg,
      sweatLevel: profile.sweatLevel,
      caffeineOk: profile.caffeineOk,
    });
    return {
      durationMin,
      carbPerHourG: target.carbPerHourG,
      debrief: debriefSession({
        requiredCarbPerHourG: target.carbPerHourG,
        durationMin,
        log: logForActivity(feedback, trackless.id),
      }),
    };
  }, [trackless, feedback]);
  const unreviewed = (id: string) => !logForActivity(feedback, id);
  const dateFmt = useMemo(
    () => new Intl.DateTimeFormat(lang === "de" ? "de-CH" : "en-GB", { day: "numeric", month: "short" }),
    [lang],
  );

  return (
    <section className="panel route-panel">
      <div className="section-head">
        <h2>{t("route.title")}</h2>
        {routed.length > 0 && <span className="pill">{t("connect.withGps", { count: routed.length })}</span>}
      </div>
      <p className="detail">{t("route.intro")}</p>

      {/* A session with no track still gets judged — just without a map. */}
      {trackless && tracklessDebrief && (
        <SessionDebrief
          debrief={tracklessDebrief.debrief}
          onLog={
            onLogSession
              ? (entry) =>
                  onLogSession(trackless.id, {
                    ...entry,
                    durationMin: tracklessDebrief.durationMin,
                    plannedCarbPerHourG: tracklessDebrief.carbPerHourG,
                  })
              : undefined
          }
        />
      )}

      {/* Only worth asking when there is a choice: with nothing synced yet the
          answer is "import one", and a switcher would just be a dead half. */}
      {routed.length > 0 && (
        <ChoiceRow
          label={t("route.source")}
          value={source}
          onChange={(v) => {
            setSource(v);
            setHoverKm(null);
          }}
          options={[
            { value: "synced" as const, label: t("route.sourceSynced"), icon: "connect" },
            { value: "import" as const, label: t("route.sourceImport"), icon: "route" },
          ]}
        />
      )}

      {source === "import" || !activity ? (
        <RaceImport onPlan={onPlan} />
      ) : (
        <>
          {routed.length > 1 && (
            <div className="route-picker" role="group" aria-label={t("connect.chooseSession")}>
              {routed.map((a) => (
                <button
                  key={a.id}
                  type="button"
                  className={`chip${a.id === activity.id ? " chip-active" : ""}${unreviewed(a.id) ? " chip-todo" : ""}`}
                  aria-pressed={a.id === activity.id}
                  onClick={() => {
                    setRouteId(a.id);
                    setHoverKm(null);
                  }}
                >
                  {SPORT_KEY[a.sport] ? t(SPORT_KEY[a.sport]) : a.sport}
                  <span className="chip-meta">
                    {dateFmt.format(new Date(a.startTime))}
                    {a.distanceM ? ` · ${(a.distanceM / 1000).toFixed(0)} km` : ""}
                  </span>
                  {/* A quiet dot marks the sessions still waiting for a debrief,
                      so the athlete sees where the gap is without reading. */}
                  {unreviewed(a.id) && <span className="chip-dot" aria-label={t("debrief.notLogged")} />}
                </button>
              ))}
            </div>
          )}

          <Suspense fallback={<p className="detail">{t("map.loading")}</p>}>
            <RouteMap activity={activity} hoverKm={hoverKm} onHoverKm={setHoverKm} />
          </Suspense>

          {activity.route && (
            <RouteInsights
              key={activity.id}
              route={activity.route}
              hintGainM={activity.elevationGainM}
              hintDistanceKm={activity.distanceM ? Math.round((activity.distanceM / 1000) * 10) / 10 : undefined}
              activity={sportToActivity(activity.sport)}
              durationMin={Math.round(activity.durationSec / 60)}
              activityId={activity.id}
              feedback={feedback}
              onLogSession={onLogSession}
              onPlan={onPlan}
              hoverKm={hoverKm}
              onHoverKm={setHoverKm}
            />
          )}
        </>
      )}
    </section>
  );
}
