import { useEffect, useMemo, useState } from "react";
import { Planner } from "./components/Planner";
import { Dashboard } from "./components/Dashboard";
import { TeamView } from "./components/TeamView";
import { CatalogView } from "./components/CatalogView";
import { AdminView } from "./components/AdminView";
import { PLANS, TIER_ORDER, type Tier } from "./subscription";
import { hasPermission, ROLE_LABELS, type Permission, type Principal } from "./auth";
import { PERSONAS, isSolo } from "./personas";
import { getConfig } from "./config";

interface TabDef {
  id: string;
  label: string;
  perm: Permission;
}

const TABS: TabDef[] = [
  { id: "plan", label: "Fuel planner", perm: "plan:use" },
  { id: "connect", label: "Connect & analyse", perm: "analysis:view_own" },
  { id: "team", label: "Team", perm: "analysis:view_team" },
  { id: "catalog", label: "Catalog", perm: "catalog:read" },
  { id: "admin", label: "Admin", perm: "org:configure" },
];

export function App() {
  const config = useMemo(() => getConfig(), []);
  const [principal, setPrincipal] = useState<Principal>(PERSONAS[0]);
  const [tier, setTier] = useState<Tier>(principal.tier);
  const [tab, setTab] = useState<string>("plan");

  const visibleTabs = useMemo(() => TABS.filter((t) => hasPermission(principal, t.perm)), [principal]);
  const canBilling = hasPermission(principal, "billing:manage") || isSolo(principal);

  // When the persona changes, adopt their plan and keep the active tab valid.
  useEffect(() => {
    setTier(principal.tier);
  }, [principal]);
  useEffect(() => {
    if (!visibleTabs.some((t) => t.id === tab)) setTab(visibleTabs[0]?.id ?? "plan");
  }, [visibleTabs, tab]);

  const selectPersona = (p: Principal) => setPrincipal(p);

  return (
    <div className="page">
      <header className="hero">
        <p className="kicker">You Go Further</p>
        <h1>Swiss endurance fueling, tuned to your training</h1>
        <p className="sub">
          Connect Strava, Garmin, Polar and Suunto, analyse training load, and get before / during /
          after fueling with Swiss products from Sponser and Winforce.
        </p>
      </header>

      {config.allowRoleSwitching && (
        <div className="personabar" role="group" aria-label="View as">
          <span className="persona-label">View as</span>
          {PERSONAS.map((p) => (
            <button
              key={p.id}
              type="button"
              className={`persona${principal.id === p.id ? " active" : ""}`}
              onClick={() => selectPersona(p)}
            >
              {p.name}
              <span className="persona-role">{ROLE_LABELS[p.role]}</span>
            </button>
          ))}
        </div>
      )}

      {/* Subscription — interactive for account owners, read-only for org seats */}
      {canBilling ? (
        <div className="tierbar" role="group" aria-label="Subscription">
          {TIER_ORDER.map((t) => {
            const plan = PLANS[t];
            return (
              <button key={t} type="button" className={`tier${tier === t ? " active" : ""}`} onClick={() => setTier(t)}>
                <span className="tier-name">{plan.name}</span>
                <span className="tier-price">{plan.priceChfPerMonth === 0 ? "Free" : `CHF ${plan.priceChfPerMonth}/mo`}</span>
                <span className="tier-tag">{plan.tagline}</span>
              </button>
            );
          })}
        </div>
      ) : (
        <div className="tier-readonly">
          Plan: <strong>{PLANS[tier].name}</strong> — managed by your organization.
        </div>
      )}

      <nav className="tabs" aria-label="Views">
        {visibleTabs.map((t) => (
          <button key={t.id} type="button" className={tab === t.id ? "tab active" : "tab"} onClick={() => setTab(t.id)}>
            {t.label}
          </button>
        ))}
      </nav>

      {tab === "plan" && <Planner />}
      {tab === "connect" && <Dashboard tier={tier} />}
      {tab === "team" && <TeamView canExport={hasPermission(principal, "data:export")} />}
      {tab === "catalog" && <CatalogView canEdit={hasPermission(principal, "catalog:edit")} />}
      {tab === "admin" && <AdminView config={config} tier={tier} orgId={principal.orgId} role={principal.role} />}

      <footer className="foot">
        {config.environment} · v{config.version} · General guidance for healthy adults — not medical
        advice. Provider connectors use official OAuth scopes; sample data is shown until a real
        account is linked.
      </footer>
    </div>
  );
}
