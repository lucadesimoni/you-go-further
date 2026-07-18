import type { AppConfig } from "../config";
import { PLANS, TIER_ORDER, type Tier } from "../subscription";
import { PERSONAS } from "../personas";
import { ROLE_LABELS, type Role } from "../auth";
import { ServerStatus } from "./ServerStatus";

const FEATURE_ROWS: { key: keyof (typeof PLANS)["free"]["features"]; label: string }[] = [
  { key: "maxConnectedProviders", label: "Connected services" },
  { key: "historyDays", label: "History (days)" },
  { key: "autoSync", label: "Auto-sync" },
  { key: "loadAnalytics", label: "Load analytics" },
  { key: "dataExport", label: "Data export" },
  { key: "aiInsights", label: "AI insights" },
];

const cell = (v: unknown) => (typeof v === "boolean" ? (v ? "✓" : "—") : String(v));

/** Org admin: tenant configuration, seats, plan, and the deployment surface. */
export function AdminView({ config, tier, orgId, role }: { config: AppConfig; tier: Tier; orgId?: string; role: Role }) {
  const members = PERSONAS.filter((p) => p.orgId === orgId);

  return (
    <main className="dash">
      <ServerStatus role={role} />
      <section className="panel">
        <div className="section-head">
          <h2>Organization</h2>
          <span className="pill">{orgId ?? "no tenant"}</span>
        </div>
        <div className="targets" style={{ padding: 0, border: "none", background: "none" }}>
          <div className="stat">
            <span className="stat-value">{members.length}</span>
            <span className="stat-label">Seats used</span>
          </div>
          <div className="stat">
            <span className="stat-value">{PLANS[tier].name}</span>
            <span className="stat-label">Plan</span>
          </div>
          <div className="stat">
            <span className="stat-value">{config.enabledProviders.length}</span>
            <span className="stat-label">Providers on</span>
          </div>
          <div className="stat">
            <span className="stat-value">{config.storeBackend}</span>
            <span className="stat-label">Store backend</span>
          </div>
        </div>
      </section>

      <section className="panel">
        <div className="section-head">
          <h2>Members &amp; roles</h2>
        </div>
        <div className="table">
          <div className="tr th">
            <span>Name</span>
            <span>Role</span>
            <span>Tier</span>
          </div>
          {members.map((m) => (
            <div className="tr" key={m.id}>
              <span>{m.name}</span>
              <span>{ROLE_LABELS[m.role]}</span>
              <span>{PLANS[m.tier].name}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="panel">
        <div className="section-head">
          <h2>Plans &amp; features</h2>
        </div>
        <div className="table matrix">
          <div className="tr th">
            <span>Feature</span>
            {TIER_ORDER.map((t) => (
              <span key={t}>{PLANS[t].name}</span>
            ))}
          </div>
          {FEATURE_ROWS.map((row) => (
            <div className="tr" key={row.key}>
              <span>{row.label}</span>
              {TIER_ORDER.map((t) => (
                <span key={t} className={t === tier ? "cell-active" : undefined}>
                  {cell(PLANS[t].features[row.key])}
                </span>
              ))}
            </div>
          ))}
          <div className="tr">
            <span>Price / month</span>
            {TIER_ORDER.map((t) => (
              <span key={t}>{PLANS[t].priceChfPerMonth === 0 ? "Free" : `CHF ${PLANS[t].priceChfPerMonth}`}</span>
            ))}
          </div>
        </div>
      </section>

      <section className="panel">
        <div className="section-head">
          <h2>Deployment</h2>
          <span className="pill">v{config.version}</span>
        </div>
        <div className="table">
          <div className="tr">
            <span>Environment</span>
            <span>{config.environment}</span>
          </div>
          <div className="tr">
            <span>API mode</span>
            <span>{config.apiBaseUrl ? config.apiBaseUrl : "client-side (mock data)"}</span>
          </div>
          <div className="tr">
            <span>Base path</span>
            <span>{config.basePath}</span>
          </div>
          <div className="tr">
            <span>Export sink</span>
            <span>{config.exportEnabled ? "enabled" : "disabled"}</span>
          </div>
        </div>
        <p className="detail" style={{ margin: "12px 0 0" }}>
          These come from runtime config (<code>window.__APP_CONFIG__</code> / env), so the same build
          runs in every environment. See <code>docs/deployment.md</code>.
        </p>
      </section>
    </main>
  );
}
