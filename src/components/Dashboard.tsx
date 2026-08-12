import { useCallback, useEffect, useMemo, useState } from "react";
import type { Activity, ProviderId } from "../model";
import { ALL_PROVIDER_IDS, DEVICE_PLATFORM_IDS, DESCRIPTORS, generateSampleWellness } from "../providers";
import { toNdjson } from "../data";
import { analyze, derivePhysiology } from "../analysis";
import { GOALS } from "../options";
import { can, limit, PLANS, requiredTierFor, type Tier } from "../subscription";
import type { AthleteInput } from "../engine";
import { api, isApiConfigured } from "../api/client";
import { connectProvider, disconnectProvider, loadActivities, loadConnections } from "../api/trainingData";
import { getConfig } from "../config";
import { loadProfile } from "../api/profileStore";
import { ChoiceRow } from "./Choice";
import { GOAL_ICONS } from "./optionIcons";
import { Stat } from "./Stat";
import { useI18n } from "../i18n";
import { Explain } from "./Explain";

const STATUS_LABEL: Record<string, string> = {
  detraining: "Detraining",
  optimal: "Optimal",
  caution: "Caution",
  "high-risk": "High risk",
};

/** Connections + analysis workspace. Feature access is gated by the active tier. */
export function Dashboard({ tier, onEditProfile }: {
  tier: Tier;
  /** Opens the one place body data is edited. */
  onEditProfile?: () => void;
}) {
  const { t } = useI18n();

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

  /**
   * Reload the athlete's sessions after a connection changed.
   *
   * `trainingData` answers this for the whole app — with a server it is the
   * server's list, without one it is the same ingestion pipeline over the
   * connections held in session storage. This screen used to keep its own
   * pipeline and its own copy of the connections, which is why connecting a
   * provider here was forgotten the moment you left the screen.
   */
  const sync = useCallback(async () => {
    setBusy("all");
    setActivities(await loadActivities(historyDays));
    setBusy(null);
  }, [historyDays]);

  // If a downgrade drops the provider cap below the connected count, trim.
  useEffect(() => {
    if (connected.size <= maxProviders) return;
    void (async () => {
      for (const id of [...connected].slice(maxProviders)) await disconnectProvider(id);
      setConnected(new Set(await loadConnections()));
      await sync();
    })();
  }, [maxProviders, connected, sync]);

  // Load the athlete's connections, and handle the OAuth return (?connected=).
  useEffect(() => {
    const justConnected = new URLSearchParams(window.location.search).get("connected");
    void (async () => {
      setConnected(new Set(await loadConnections()));
      await sync();
      if (justConnected) {
        setBanner(`${justConnected} connected via OAuth — your activities were imported to your account.`);
        window.history.replaceState({}, "", window.location.pathname);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const toggle = async (id: ProviderId) => {
    if (connected.has(id)) {
      setBusy(id);
      setConnected(new Set(await disconnectProvider(id)));
      await sync();
      return;
    }
    if (connected.size >= maxProviders) return;

    // With a server, connecting means real consent: fetch the authorize URL
    // *with the session attached*, so the `state` it carries binds whatever
    // comes back to this athlete, then leave the page for the provider.
    if (oauthMode) {
      const { authorizeUrl } = await api.oauthAuthorizeUrl(id, window.location.href);
      window.location.href = authorizeUrl.startsWith("http") ? authorizeUrl : `${apiBase}${authorizeUrl}`;
      return;
    }

    setBusy(id);
    setConnected(new Set(await connectProvider(id)));
    await sync();
  };

  const profile = useMemo(() => ({ bodyWeightKg, maxHr }), [bodyWeightKg, maxHr]);
  const report = useMemo(
    () => (activities.length ? analyze(activities, profile, goal) : null),
    [activities, profile, goal],
  );
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
        {/* Wrapped rather than columned: five goal names of very different
            lengths in four languages will not share equal columns. */}
        <ChoiceRow
          label={t("plan.goal")}
          value={goal}
          onChange={(v) => setGoal(v)}
          options={GOALS.map((g) => ({ value: g.value, label: t(g.labelKey), icon: GOAL_ICONS[g.value] }))}
        />
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
