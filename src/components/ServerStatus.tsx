import { useEffect, useState } from "react";
import { api, isApiConfigured, type AdminOverview, type HealthResponse } from "../api/client";
import type { Role } from "../auth";

type State =
  | { kind: "client-side" }
  | { kind: "loading" }
  | { kind: "ok"; health: HealthResponse; overview: AdminOverview }
  | { kind: "error"; message: string };

/**
 * Live proof that the frontend talks to the real backend: calls /api/health and
 * /api/admin/overview and renders the server's own view. Shown in the Admin tab.
 * Falls back gracefully to a "client-side" note when no API is configured.
 */
export function ServerStatus({ role }: { role: Role }) {
  const [state, setState] = useState<State>({ kind: isApiConfigured() ? "loading" : "client-side" });
  const [seeded, setSeeded] = useState(false);

  useEffect(() => {
    if (!isApiConfigured()) return;
    let cancelled = false;
    (async () => {
      try {
        const [health, overview] = await Promise.all([api.health(), api.adminOverview(role)]);
        if (!cancelled) setState({ kind: "ok", health, overview });
      } catch (e) {
        if (!cancelled) setState({ kind: "error", message: e instanceof Error ? e.message : "Request failed" });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [role, seeded]);

  const seed = async () => {
    for (const p of ["garmin", "strava", "polar", "suunto"]) await api.ingest(p, 28);
    setSeeded((s) => !s);
  };

  if (state.kind === "client-side") {
    return (
      <section className="panel">
        <div className="section-head">
          <h2>Backend</h2>
          <span className="pill">client-side</span>
        </div>
        <p className="detail" style={{ margin: 0 }}>
          Running fully in the browser against the shared domain modules. Set <code>apiBaseUrl</code>{" "}
          (see <code>docs/deployment.md</code>) to route through the HTTP API server instead — the
          same engine, analysis, and RBAC behind a network boundary.
        </p>
      </section>
    );
  }

  return (
    <section className="panel">
      <div className="section-head">
        <h2>Backend</h2>
        <span className={`pill ${state.kind === "ok" ? "pill-live" : ""}`}>
          {state.kind === "ok" ? "● live API" : state.kind === "error" ? "error" : "connecting…"}
        </span>
      </div>

      {state.kind === "loading" && <p className="detail">Contacting the API…</p>}
      {state.kind === "error" && <p className="detail">Could not reach the API: {state.message}</p>}

      {state.kind === "ok" && (
        <>
          <div className="targets" style={{ padding: 0, border: "none", background: "none" }}>
            <div className="stat">
              <span className="stat-value">{state.health.status === "ok" ? "OK" : state.health.status}</span>
              <span className="stat-label">API health</span>
            </div>
            <div className="stat">
              <span className="stat-value">{state.health.environment}</span>
              <span className="stat-label">Environment</span>
            </div>
            <div className="stat">
              <span className="stat-value">{state.overview.deployment.activitiesStored}</span>
              <span className="stat-label">Rows in store</span>
            </div>
            <div className="stat">
              <span className="stat-value">v{state.health.version}</span>
              <span className="stat-label">Server version</span>
            </div>
          </div>
          <div className="tl-foot" style={{ marginTop: 12 }}>
            <span>Served by the HTTP API — data below is fetched live over the network.</span>
            <button type="button" className="btn btn-primary" onClick={seed}>
              Seed sample data
            </button>
          </div>
        </>
      )}
    </section>
  );
}
