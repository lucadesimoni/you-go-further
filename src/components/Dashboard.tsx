import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Activity, ProviderId } from "../model";
import { ALL_PROVIDER_IDS, DEVICE_PLATFORM_IDS, DESCRIPTORS, generateSampleWellness, ProviderRegistry } from "../providers";
import type { ProviderCredential } from "../providers/types";
import { IngestionPipeline, InMemoryActivityStore, lastNDays, toNdjson } from "../data";
import { analyze, derivePhysiology, logForActivity, sportToActivity } from "../analysis";
import type { SessionInput } from "./Planner";
import { GOALS } from "../options";
import { can, limit, PLANS, requiredTierFor, type Tier } from "../subscription";
import type { AthleteInput } from "../engine";
import { api, isApiConfigured } from "../api/client";
import type { SessionFeedback } from "../feedback";
import { getConfig } from "../config";
import { loadProfile } from "../api/profileStore";
import { Stat } from "./Stat";
import { useI18n, type TranslationKey } from "../i18n";
import { RouteInsights } from "./RouteInsights";
import { Explain } from "./Explain";
// Code-split: Leaflet (~150 KB) loads only when a route map is actually shown.
const RouteMap = lazy(() => import("./RouteMap").then((m) => ({ default: m.RouteMap })));

/**
 * Sport names for the route picker — the same translated names the start screen
 * uses, so a session called "Trail running" there isn't "Trail run" here.
 */
const SPORT_KEY: Record<string, TranslationKey> = {
  run: "activity.running",
  "trail-run": "activity.trail-running",
  ride: "activity.cycling",
  swim: "activity.swimming",
  triathlon: "activity.triathlon",
};

const STATUS_LABEL: Record<string, string> = {
  detraining: "Detraining",
  optimal: "Optimal",
  caution: "Caution",
  "high-risk": "High risk",
};

/** Connections + analysis workspace. Feature access is gated by the active tier. */
export function Dashboard({
  tier,
  feedback = [],
  onLogSession,
  focusActivityId,
  onPlanRoute,
  onEditProfile,
}: {
  tier: Tier;
  /** The athlete's session logs, so a past route can be debriefed here. */
  feedback?: SessionFeedback[];
  onLogSession?: (
    activityId: string,
    entry: Pick<SessionFeedback, "gi" | "energy" | "actualCarbPerHourG"> & {
      durationMin: number;
      plannedCarbPerHourG: number;
    },
  ) => Promise<void> | void;
  /** Open on a specific session — e.g. "How did it go?" from the start screen. */
  focusActivityId?: string;
  onPlanRoute?: (prefill: Partial<SessionInput>) => void;
  /** Opens the one place body data is edited. */
  onEditProfile?: () => void;
}) {
  const { t, lang } = useI18n();
  const registry = useRef(new ProviderRegistry());
  const store = useRef(new InMemoryActivityStore());
  const pipeline = useRef(new IngestionPipeline(registry.current, store.current));

  const [connected, setConnected] = useState<Set<ProviderId>>(new Set());
  const [activities, setActivities] = useState<Activity[]>([]);
  const [busy, setBusy] = useState<ProviderId | "all" | null>(null);
  // Body data comes from the athlete's *one* profile, never a second copy kept
  // here: a weight edited on this tab that silently didn't persist would make
  // the analysis disagree with the plan.
  const bodyProfile = useMemo(() => loadProfile(), []);
  const bodyWeightKg = bodyProfile.bodyWeightKg;
  const maxHr = bodyProfile.maxHrBpm;
  // Goal is an analysis lens, not body data — it belongs to this screen.
  const [goal, setGoal] = useState<AthleteInput["goal"]>("endurance-performance");
  const [banner, setBanner] = useState<string | null>(null);

  // Real OAuth connect is available only when talking to the API server.
  const apiBase = getConfig().apiBaseUrl;
  const oauthMode = isApiConfigured();

  const maxProviders = limit(tier, "maxConnectedProviders");
  const historyDays = limit(tier, "historyDays");
  const loadAnalytics = can(tier, "loadAnalytics");
  const exportEnabled = can(tier, "dataExport");

  // Rebuild the store from the currently-connected providers.
  const sync = useCallback(
    async (providers: Set<ProviderId>) => {
      setBusy("all");
      await store.current.clear();
      // With an API, the server already holds the athlete's imported sessions —
      // and the start screen reads that same list. Re-generating them here would
      // give the two screens different sessions with different ids, so a
      // "review this run" handoff would silently land on the wrong one.
      if (isApiConfigured()) {
        try {
          setActivities((await api.activities()).activities);
          setBusy(null);
          return;
        } catch {
          /* API unreachable — fall back to the local pipeline below */
        }
      }
      const creds: ProviderCredential[] = [...providers].map((p) => ({ provider: p, accessToken: "demo" }));
      const window = lastNDays(Math.min(historyDays, 120));
      if (creds.length) await pipeline.current.ingestAll(creds, window);
      setActivities(await store.current.query());
      setBusy(null);
    },
    [historyDays],
  );

  // If a downgrade drops the provider cap below the connected count, trim.
  useEffect(() => {
    if (connected.size > maxProviders) {
      const trimmed = new Set([...connected].slice(0, maxProviders));
      setConnected(trimmed);
      void sync(trimmed);
    }
  }, [maxProviders, connected, sync]);

  // In API mode, load real connections and handle the OAuth return (?connected=).
  useEffect(() => {
    if (!oauthMode) return;
    const justConnected = new URLSearchParams(window.location.search).get("connected");
    (async () => {
      try {
        // Through the API client, so the request carries the session: a
        // role header would read the demo persona's connections instead.
        const data = await api.connections();
        const provs = new Set(data.connections.map((c) => c.provider as ProviderId));
        setConnected(provs);
        await sync(provs);
        if (justConnected) {
          setBanner(`${justConnected} connected via OAuth — your activities were imported to your account.`);
          window.history.replaceState({}, "", window.location.pathname);
        }
      } catch {
        /* API unreachable — stay in mock mode */
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const toggle = async (id: ProviderId) => {
    // Real OAuth: redirect to the provider's consent screen; disconnect via API.
    if (oauthMode) {
      if (connected.has(id)) {
        setBusy(id);
        await api.connectionRemove(id);
        const next = new Set(connected);
        next.delete(id);
        setConnected(next);
        await sync(next);
        return;
      }
      if (connected.size >= maxProviders) return;
      // Fetch the consent URL with the session attached, so the `state` it
      // carries binds the imported sessions to this athlete (see the router).
      const { authorizeUrl } = await api.oauthAuthorizeUrl(id, window.location.href);
      window.location.href = authorizeUrl.startsWith("http") ? authorizeUrl : `${apiBase}${authorizeUrl}`;
      return;
    }

    const next = new Set(connected);
    if (next.has(id)) next.delete(id);
    else {
      if (next.size >= maxProviders) return;
      next.add(id);
    }
    setConnected(next);
    setBusy(id);
    await sync(next);
  };

  const profile = useMemo(() => ({ bodyWeightKg, maxHr }), [bodyWeightKg, maxHr]);
  const report = useMemo(
    () => (activities.length ? analyze(activities, profile, goal) : null),
    [activities, profile, goal],
  );
  /**
   * Sessions with a GPS track, offered as a picker.
   *
   * Simply taking the newest few would often show an athlete four bike rides and
   * no run, so the most recent session of *each* sport is seeded first and the
   * remaining slots are filled with the newest others. That guarantees a runner
   * sees a run.
   */
  const routedActivities = useMemo(() => {
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

  const dateFmt = useMemo(
    () => new Intl.DateTimeFormat(lang === "de" ? "de-CH" : "en-GB", { day: "numeric", month: "short" }),
    [lang],
  );
  const [routeId, setRouteId] = useState<string | null>(null);
  // Arriving from "How did it go?" on the start screen: open that session.
  useEffect(() => {
    if (focusActivityId) setRouteId(focusActivityId);
  }, [focusActivityId]);
  const routedActivity = routedActivities.find((a) => a.id === routeId) ?? routedActivities[0] ?? null;
  const unreviewed = (id: string) => !logForActivity(feedback, id);
  const physiology = useMemo(() => {
    const wellness = [...connected].flatMap((p) => generateSampleWellness(p, 21));
    return derivePhysiology(wellness);
  }, [connected]);
  const hrvRatio =
    physiology.hrvMs && physiology.hrvBaselineMs ? physiology.hrvMs / physiology.hrvBaselineMs : undefined;
  const hrvStatus = hrvRatio === undefined ? "—" : hrvRatio < 0.9 ? "below baseline" : hrvRatio > 1.1 ? "above baseline" : "balanced";

  const maxWeekLoad = report ? Math.max(1, ...report.weeks.map((w) => w.load)) : 1;

  const exportData = () => {
    const blob = new Blob([toNdjson(activities)], { type: "application/x-ndjson" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "activities.ndjson";
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <main className="dash">
      {/* Connections */}
      <section className="panel">
        <div className="section-head">
          <h2>{t("connect.title")}</h2>
          <span className={`pill${oauthMode ? " pill-live" : ""}`}>
            {oauthMode ? "OAuth · " : "demo · "}
            {connected.size}/{maxProviders} connected
          </span>
        </div>
        {banner && <p className="upgrade-note" style={{ borderColor: "var(--post)", marginTop: 0 }}>{banner}</p>}
        <p className="detail">
          {oauthMode ? "Sign in on the provider; your sessions import to your account." : "Link your training services."}
        </p>
        <div className="providers">
          {ALL_PROVIDER_IDS.map((id) => {
            const d = DESCRIPTORS[id];
            const isOn = connected.has(id);
            const atCap = !isOn && connected.size >= maxProviders;
            const caps = Object.entries(d.capabilities)
              .filter(([, v]) => v)
              .map(([k]) => k);
            return (
              <div key={id} className={`provider-card${isOn ? " on" : ""}`}>
                <div className="provider-top">
                  <span className="provider-name">{d.displayName}</span>
                  <button
                    type="button"
                    className={isOn ? "btn btn-ghost" : "btn btn-primary"}
                    disabled={atCap || busy !== null}
                    onClick={() => toggle(id)}
                    title={atCap ? `Upgrade to connect more than ${maxProviders}` : undefined}
                  >
                    {busy === id ? "…" : isOn ? t("connect.disconnect") : atCap ? t("connect.locked") : t("connect.connect")}
                  </button>
                </div>
                <div className="tags">
                  {caps.map((c) => (
                    <span key={c} className="tag">
                      {c}
                    </span>
                  ))}
                </div>
                <p className="provider-note">{d.syncNote}</p>
              </div>
            );
          })}
        </div>
        {/* Apple Health and Health Connect can only be read on the phone, so
            they are never offered here — but if the app has synced them, the
            athlete should see that here too rather than wonder where it went. */}
        {DEVICE_PLATFORM_IDS.filter((id) => connected.has(id)).map((id) => (
          <p key={id} className="detail" style={{ marginBottom: 0 }}>
            <strong>{DESCRIPTORS[id].displayName}</strong> is syncing from your phone — weight, HRV, resting heart rate
            and workouts. Manage it in the mobile app.
          </p>
        ))}
        {connected.size >= maxProviders && maxProviders < ALL_PROVIDER_IDS.length && (
          <p className="upgrade-note">
            Connect all {ALL_PROVIDER_IDS.length} services with{" "}
            <strong>{PLANS[requiredTierFor("autoSync") ?? "pro"].name}</strong>.
          </p>
        )}
      </section>

      {/* How the analysis below is framed. Body data is shown, not re-edited:
          there is one profile, and it lives in Profile & health. */}
      <section className="panel">
        <div className="section-head">
          <h2>{t("connect.analysisSettings")}</h2>
          <span className="pill">history: {historyDays >= 365 ? `${Math.round(historyDays / 365)} yr` : `${historyDays} d`}</span>
        </div>
        <div className="field">
          <label htmlFor="dgoal">{t("plan.goal")}</label>
          <select id="dgoal" value={goal} onChange={(e) => setGoal(e.target.value as AthleteInput["goal"])}>
            {GOALS.map((g) => (
              <option key={g.value} value={g.value}>
                {t(g.labelKey)}
              </option>
            ))}
          </select>
        </div>
        <div className="from-profile">
          <span>{t("connect.usingProfile", { weight: bodyWeightKg, maxHr })}</span>
          {onEditProfile && (
            <button type="button" className="link-btn" onClick={onEditProfile}>
              {t("plan.editProfile")}
            </button>
          )}
        </div>
      </section>

      {/* Body signals — the "optimised for your body" layer */}
      {physiology.hasSignals && (
        <section className="panel">
          <div className="section-head">
            <h2>{t("connect.bodySignals")}</h2>
            <span className="pill">from your devices</span>
          </div>
          <div className="targets plain-grid">
            <Stat label={t("signals.readiness")} value={physiology.readiness !== undefined ? `${physiology.readiness}/100` : "—"} />
            <Stat
              label={t("signals.hrv")}
              value={physiology.hrvMs ? `${physiology.hrvMs} ms` : "—"}
              note={hrvStatus !== "—" ? hrvStatus : undefined}
              // HRV below baseline is the one worth flagging; at or above it is
              // not news, so it stays neutral rather than congratulating anyone.
              tone={hrvStatus === "below baseline" ? "watch" : "muted"}
            />
            <Stat label={t("signals.restingHr")} value={physiology.restingHr ? `${physiology.restingHr} bpm` : "—"} />
            <Stat label={t("signals.sleep")} value={physiology.sleepScore ? `${physiology.sleepScore}/100` : "—"} />
          </div>
          <Explain>
            <p>
              These personalise your fuelling — low readiness dials up recovery carbs, and a sweat
              test (add it in the Fuel planner) sets hydration and sodium to your own chemistry
              instead of population averages.
            </p>
          </Explain>
        </section>
      )}

      {/* Route, terrain and weather for a chosen session */}
      {routedActivity && (
        <section className="panel">
          <div className="section-head">
            <h2>{t("connect.route")}</h2>
            <span className="pill">{t("connect.withGps", { count: routedActivities.length })}</span>
          </div>
          <p className="detail">
            {t("connect.routeIntro")}
          </p>
          {/* Pick which session to look at: the latest is often a ride, and an
              athlete wants to see the run they actually care about. */}
          {routedActivities.length > 1 && (
            <div className="route-picker" role="group" aria-label={t("connect.chooseSession")}>
              {routedActivities.map((a) => (
                <button
                  key={a.id}
                  type="button"
                  className={`chip${a.id === routedActivity.id ? " chip-active" : ""}${
                    unreviewed(a.id) ? " chip-todo" : ""
                  }`}
                  aria-pressed={a.id === routedActivity.id}
                  onClick={() => setRouteId(a.id)}
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
            <RouteMap activity={routedActivity} />
          </Suspense>
          {routedActivity.route && (
            <RouteInsights
              key={routedActivity.id}
              route={routedActivity.route}
              hintGainM={routedActivity.elevationGainM}
              hintDistanceKm={
                routedActivity.distanceM ? Math.round((routedActivity.distanceM / 1000) * 10) / 10 : undefined
              }
              activity={sportToActivity(routedActivity.sport)}
              durationMin={Math.round(routedActivity.durationSec / 60)}
              activityId={routedActivity.id}
              feedback={feedback}
              onLogSession={onLogSession}
              onPlan={onPlanRoute}
            />
          )}
        </section>
      )}

      <section className="panel">
        <div className="section-head">
          <h2>{t("connect.trainingAnalysis")}</h2>
          {exportEnabled && activities.length > 0 && (
            <button type="button" className="btn btn-ghost" onClick={exportData}>
              {t("dash.exportNdjson")}
            </button>
          )}
        </div>

        {!report ? (
          <p className="detail">{t("dash.connectPrompt")}</p>
        ) : (
          <>
            <div className="targets plain-grid">
              {/* Same words as everywhere else: the athlete does *sessions*.
                  "Activity" stays a model term, not something a screen says. */}
              <Stat label={t("insights.activities")} value={String(report.totalActivities)} />
              <Stat label={t("insights.hours")} value={`${report.totalHours}`} />
              <Stat label={t("home.distance")} value={`${report.totalDistanceKm} km`} />
              <Stat label={t("connect.weeklyCarbs")} value={`${report.nutrition.weeklyDuringCarbG} g`} />
            </div>

            {loadAnalytics ? (
              <>
                <div className="acwr">
                  <div className={`acwr-badge acwr-${report.acwr.status}`}>{STATUS_LABEL[report.acwr.status]}</div>
                  <div className="acwr-body">
                    <strong>Acute : chronic load {report.acwr.ratio || "—"}</strong>
                    <span className="detail">
                      7-day load {report.acwr.acuteLoad} vs. 28-day weekly avg {report.acwr.chronicWeeklyLoad}. The 0.8–1.3
                      band is the sweet spot for adapting without overreaching.
                    </span>
                  </div>
                </div>

                <h4 className="chart-title">{t("dash.weeklyLoad")}</h4>
                <div className="bars">
                  {report.weeks.slice(-10).map((w) => (
                    <div className="bar-col" key={w.weekStart} title={`${w.weekStart}: load ${w.load}, ${w.durationHr} h`}>
                      <div className="bar" style={{ height: `${Math.round((w.load / maxWeekLoad) * 100)}%` }} />
                      <span className="bar-label">{w.weekStart.slice(5)}</span>
                    </div>
                  ))}
                </div>

                <div className="nutrition-demand">
                  {t("dash.thisWeek")} <strong>{report.nutrition.fuelledSessions}</strong>{" "}
                  {t("dash.ofSessions", { total: report.nutrition.totalSessions })}
                  need in-session fuel · avg <strong>{report.nutrition.avgCarbPerHourG} g/h</strong> · total{" "}
                  <strong>{report.nutrition.weeklyDuringCarbG} g</strong> carbohydrate on the bike/run.
                </div>
              </>
            ) : (
              <div className="locked">
                <p>
                  <strong>{t("dash.loadAnalyticsPitch")}</strong> — acute:chronic workload, injury-risk flags and the full
                  weekly load chart.
                </p>
                <p className="detail">
                  {t("dash.availableOn", { tier: PLANS[requiredTierFor("loadAnalytics") ?? "pro"].name })}
                </p>
              </div>
            )}
          </>
        )}
      </section>
    </main>
  );
}
