import { useEffect, useMemo, useState } from "react";
import { Planner } from "./components/Planner";
import { Dashboard } from "./components/Dashboard";
import { TeamView } from "./components/TeamView";
import { CatalogView } from "./components/CatalogView";
import { AdminView } from "./components/AdminView";
import { LoginScreen } from "./components/LoginScreen";
import { ProgressView } from "./components/ProgressView";
import { PLANS, TIER_ORDER, type Tier } from "./subscription";
import { currentAccount, hasPermission, signInAsDemo, signOut, type Account, type Permission } from "./auth";
import { PERSONAS, isSolo } from "./personas";
import { getConfig } from "./config";
import { generateSampleActivities } from "./providers";
import { lastNDays } from "./data";
import { computeGamification } from "./gamification";
import { loadFeedback } from "./api/feedbackStore";
import { clearSessionToken } from "./api/client";

interface TabDef {
  id: string;
  label: string;
  perm: Permission;
}

const TABS: TabDef[] = [
  { id: "plan", label: "Fuel planner", perm: "plan:use" },
  { id: "progress", label: "Progress", perm: "plan:use" },
  { id: "connect", label: "Connect & analyse", perm: "analysis:view_own" },
  { id: "team", label: "Team", perm: "analysis:view_team" },
  { id: "catalog", label: "Catalog", perm: "catalog:read" },
  { id: "admin", label: "Admin", perm: "org:configure" },
];

export function App() {
  const config = useMemo(() => getConfig(), []);
  const [account, setAccount] = useState<Account | null>(() => currentAccount());
  const [tier, setTier] = useState<Tier>(account?.tier ?? "free");
  const [tab, setTab] = useState<string>("plan");

  const [feedbackCount, setFeedbackCount] = useState(0);

  const visibleTabs = useMemo(() => (account ? TABS.filter((t) => hasPermission(account, t.perm)) : []), [account]);
  const canBilling = account ? hasPermission(account, "billing:manage") || isSolo(account) : false;

  // Gamification profile — deterministic per account, from a synced history.
  const gamification = useMemo(() => {
    if (!account) return null;
    const range = lastNDays(120);
    const activities = ["strava", "garmin", "polar"].flatMap((p) =>
      generateSampleActivities(p as "strava", range.after, range.before),
    );
    return computeGamification({ activities, feedbackCount, connectionsCount: 0 });
  }, [account, feedbackCount]);

  useEffect(() => {
    if (account) setTier(account.tier);
  }, [account]);
  useEffect(() => {
    if (!account) return;
    let alive = true;
    loadFeedback(account.role)
      .then((list) => alive && setFeedbackCount(list.length))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [account]);
  useEffect(() => {
    if (!visibleTabs.some((t) => t.id === tab)) setTab(visibleTabs[0]?.id ?? "plan");
  }, [visibleTabs, tab]);

  // Gate: no session → login / register.
  if (!account) {
    return <LoginScreen onSignedIn={setAccount} allowDemo={config.allowRoleSwitching} />;
  }

  const initials = account.name
    .split(" ")
    .map((s) => s[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <div className="page">
      {/* Account bar */}
      <div className="accountbar">
        <div className="account-id">
          <span className="avatar">{initials}</span>
          <span className="account-meta">
            <span className="account-name">{account.name}</span>
            <span className="account-email">{account.email}</span>
          </span>
        </div>
        <div className="account-actions">
          {gamification && (
            <button
              type="button"
              className="level-chip"
              onClick={() => setTab("progress")}
              title={`${gamification.xp} XP · ${gamification.streakDays}-day streak`}
            >
              <span className="level-chip-num">{gamification.level}</span>
              <span className="level-chip-meta">
                <span className="level-chip-name">{gamification.levelName}</span>
                <span className="level-chip-streak">🔥 {gamification.streakDays}</span>
              </span>
            </button>
          )}
          {config.allowRoleSwitching && (
            <select
              className="demo-switch"
              aria-label="Demo account"
              value={account.authProvider === "demo" ? account.id : ""}
              onChange={(e) => {
                const p = PERSONAS.find((x) => x.id === e.target.value);
                if (p) setAccount(signInAsDemo(p));
              }}
            >
              <option value="">Demo account…</option>
              {PERSONAS.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          )}
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => {
              clearSessionToken();
              setAccount(signOut());
            }}
          >
            Sign out
          </button>
        </div>
      </div>

      <header className="hero">
        <p className="kicker">You Go Further</p>
        <h1>Swiss endurance fueling, tuned to your training</h1>
        <p className="sub">
          Connect Strava, Garmin, Polar and Suunto, analyse training load, and get before / during /
          after fueling with Swiss products from Sponser and Winforce.
        </p>
      </header>

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

      {tab === "plan" && <Planner role={account.role} />}
      {tab === "progress" && gamification && <ProgressView profile={gamification} />}
      {tab === "connect" && <Dashboard tier={tier} />}
      {tab === "team" && <TeamView canExport={hasPermission(account, "data:export")} />}
      {tab === "catalog" && <CatalogView canEdit={hasPermission(account, "catalog:edit")} />}
      {tab === "admin" && <AdminView config={config} tier={tier} orgId={account.orgId} role={account.role} />}

      <footer className="foot">
        {config.environment} · v{config.version} · General guidance for healthy adults — not medical
        advice. Provider connectors use official OAuth scopes; sample data is shown until a real
        account is linked.
      </footer>
    </div>
  );
}
