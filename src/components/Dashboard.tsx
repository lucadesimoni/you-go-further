import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Activity, ProviderId } from "../model";
import { ALL_PROVIDER_IDS, DESCRIPTORS, generateSampleWellness, ProviderRegistry } from "../providers";
import type { ProviderCredential } from "../providers/types";
import { IngestionPipeline, InMemoryActivityStore, lastNDays, toNdjson } from "../data";
import { analyze, derivePhysiology } from "../analysis";
import { GOALS } from "../options";
import { can, limit, PLANS, requiredTierFor, type Tier } from "../subscription";
import type { AthleteInput } from "../engine";
import { isApiConfigured } from "../api/client";
import { getConfig } from "../config";
import { Stat } from "./Stat";
// Code-split: Leaflet (~150 KB) loads only when a route map is actually shown.
const RouteMap = lazy(() => import("./RouteMap").then((m) => ({ default: m.RouteMap })));

const STATUS_LABEL: Record<string, string> = {
  detraining: "Detraining",
  optimal: "Optimal",
  caution: "Caution",
  "high-risk": "High risk",
};

/** Connections + analysis workspace. Feature access is gated by the active tier. */
export function Dashboard({ tier }: { tier: Tier }) {
  const registry = useRef(new ProviderRegistry());
  const store = useRef(new InMemoryActivityStore());
  const pipeline = useRef(new IngestionPipeline(registry.current, store.current));

  const [connected, setConnected] = useState<Set<ProviderId>>(new Set());
  const [activities, setActivities] = useState<Activity[]>([]);
  const [busy, setBusy] = useState<ProviderId | "all" | null>(null);
  const [bodyWeightKg, setBodyWeightKg] = useState(70);
  const [maxHr, setMaxHr] = useState(190);
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
        const res = await fetch(`${apiBase}/api/connections`, { headers: { "x-role": "athlete" } });
        const data = (await res.json()) as { connections: { provider: ProviderId }[] };
        const provs = new Set(data.connections.map((c) => c.provider));
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
        await fetch(`${apiBase}/api/connections/${id}`, { method: "DELETE", headers: { "x-role": "athlete" } });
        const next = new Set(connected);
        next.delete(id);
        setConnected(next);
        await sync(next);
        return;
      }
      if (connected.size >= maxProviders) return;
      window.location.href = `${apiBase}/api/oauth/${id}/start?return_to=${encodeURIComponent(window.location.href)}`;
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
  // Most recent session with a GPS track, for the route map.
  const routedActivity = useMemo(
    () =>
      [...activities]
        .filter((a) => a.route && a.route.length > 1)
        .sort((a, b) => Date.parse(b.startTime) - Date.parse(a.startTime))[0] ?? null,
    [activities],
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
          <h2>Connections</h2>
          <span className={`pill${oauthMode ? " pill-live" : ""}`}>
            {oauthMode ? "OAuth · " : "demo · "}
            {connected.size}/{maxProviders} connected
          </span>
        </div>
        {banner && <p className="upgrade-note" style={{ borderColor: "var(--post)", marginTop: 0 }}>{banner}</p>}
        <p className="detail">
          {oauthMode
            ? "Connect signs you in on the provider (Strava OAuth) and imports your activities to your account."
            : "Link your training services. Data is normalized into one model and fed to the analysis and fueling engine."}
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
                    {busy === id ? "…" : isOn ? "Disconnect" : atCap ? "Locked" : oauthMode ? "Connect →" : "Connect"}
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
        {connected.size >= maxProviders && maxProviders < ALL_PROVIDER_IDS.length && (
          <p className="upgrade-note">
            Connect all {ALL_PROVIDER_IDS.length} services with{" "}
            <strong>{PLANS[requiredTierFor("autoSync") ?? "pro"].name}</strong>.
          </p>
        )}
      </section>

      {/* Profile controls */}
      <section className="panel">
        <div className="section-head">
          <h2>Athlete profile</h2>
          <span className="pill">history: {historyDays >= 365 ? `${Math.round(historyDays / 365)} yr` : `${historyDays} d`}</span>
        </div>
        <div className="profile-grid">
          <div className="field">
            <label htmlFor="bw">
              Body weight <span className="value">{bodyWeightKg} kg</span>
            </label>
            <input id="bw" type="range" min={40} max={120} value={bodyWeightKg} onChange={(e) => setBodyWeightKg(Number(e.target.value))} />
          </div>
          <div className="field">
            <label htmlFor="mhr">
              Max HR <span className="value">{maxHr} bpm</span>
            </label>
            <input id="mhr" type="range" min={160} max={210} value={maxHr} onChange={(e) => setMaxHr(Number(e.target.value))} />
          </div>
          <div className="field">
            <label htmlFor="dgoal">Goal</label>
            <select id="dgoal" value={goal} onChange={(e) => setGoal(e.target.value as AthleteInput["goal"])}>
              {GOALS.map((g) => (
                <option key={g.value} value={g.value}>
                  {g.label}
                </option>
              ))}
            </select>
          </div>
        </div>
      </section>

      {/* Body signals — the "optimized for your body" layer */}
      {physiology.hasSignals && (
        <section className="panel">
          <div className="section-head">
            <h2>Body signals</h2>
            <span className="pill">from your devices</span>
          </div>
          <div className="targets plain-grid">
            <Stat label="Readiness" value={physiology.readiness !== undefined ? `${physiology.readiness}/100` : "—"} />
            <Stat label="Overnight HRV" value={physiology.hrvMs ? `${physiology.hrvMs} ms` : "—"} note={hrvStatus !== "—" ? hrvStatus : undefined} />
            <Stat label="Resting HR" value={physiology.restingHr ? `${physiology.restingHr} bpm` : "—"} />
            <Stat label="Sleep" value={physiology.sleepScore ? `${physiology.sleepScore}/100` : "—"} />
          </div>
          <p className="detail note-top">
            These personalize your fueling — low readiness dials up recovery carbs, and a sweat test
            (add it in the Fuel planner) sets hydration and sodium to your own chemistry instead of
            population averages.
          </p>
        </section>
      )}

      {/* Analysis */}
      {routedActivity && (
        <section className="panel">
          <div className="section-head">
            <h2>Route &amp; fuel stops</h2>
            <span className="pill">latest with GPS</span>
          </div>
          <p className="detail">
            Your most recent recorded route, with fuelling stops pinned along it — where to take carbs so
            you never run the tank down. Open-source map (OpenStreetMap data).
          </p>
          <Suspense fallback={<p className="detail">Loading map…</p>}>
            <RouteMap activity={routedActivity} />
          </Suspense>
        </section>
      )}

      <section className="panel">
        <div className="section-head">
          <h2>Training analysis</h2>
          {exportEnabled && activities.length > 0 && (
            <button type="button" className="btn btn-ghost" onClick={exportData}>
              Export NDJSON
            </button>
          )}
        </div>

        {!report ? (
          <p className="detail">Connect a service to sync activities and see your analysis.</p>
        ) : (
          <>
            <div className="targets plain-grid">
              <Stat label="Activities" value={String(report.totalActivities)} />
              <Stat label="Hours" value={`${report.totalHours}`} />
              <Stat label="Distance" value={`${report.totalDistanceKm} km`} />
              <Stat label="Weekly carbs" value={`${report.nutrition.weeklyDuringCarbG} g`} />
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

                <h4 className="chart-title">Weekly training load</h4>
                <div className="bars">
                  {report.weeks.slice(-10).map((w) => (
                    <div className="bar-col" key={w.weekStart} title={`${w.weekStart}: load ${w.load}, ${w.durationHr} h`}>
                      <div className="bar" style={{ height: `${Math.round((w.load / maxWeekLoad) * 100)}%` }} />
                      <span className="bar-label">{w.weekStart.slice(5)}</span>
                    </div>
                  ))}
                </div>

                <div className="nutrition-demand">
                  This week: <strong>{report.nutrition.fueledSessions}</strong> of {report.nutrition.totalSessions} sessions
                  need in-session fuel · avg <strong>{report.nutrition.avgCarbPerHourG} g/h</strong> · total{" "}
                  <strong>{report.nutrition.weeklyDuringCarbG} g</strong> carbohydrate on the bike/run.
                </div>
              </>
            ) : (
              <div className="locked">
                <p>
                  <strong>Load analytics & weekly trends</strong> — acute:chronic workload, injury-risk flags and the full
                  weekly load chart.
                </p>
                <p className="detail">
                  Available on <strong>{PLANS[requiredTierFor("loadAnalytics") ?? "pro"].name}</strong> and up.
                </p>
              </div>
            )}
          </>
        )}
      </section>
    </main>
  );
}
