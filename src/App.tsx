import { useEffect, useMemo, useState } from "react";
import { Planner } from "./components/Planner";
import { Dashboard } from "./components/Dashboard";
import { TeamView } from "./components/TeamView";
import { CatalogView } from "./components/CatalogView";
import { AdminView } from "./components/AdminView";
import { LoginScreen } from "./components/LoginScreen";
import { ProgressView } from "./components/ProgressView";
import { ProfileView } from "./components/ProfileView";
import { SubscriptionView } from "./components/SubscriptionView";
import { AccountMenu } from "./components/AccountMenu";
import { type Tier } from "./subscription";
import { currentAccount, hasPermission, signInAsDemo, signOut, type Account, type Permission } from "./auth";
import { isSolo } from "./personas";
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

// Primary navigation — the core work surfaces. Personal screens (Profile,
// Subscription) live in the account menu, not here, so each is in one place.
const TABS: TabDef[] = [
  { id: "plan", label: "Plan", perm: "plan:use" },
  { id: "progress", label: "Progress", perm: "plan:use" },
  { id: "connect", label: "Connect", perm: "analysis:view_own" },
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
  // Profile & Subscription are reached from the account menu, not the nav — allow
  // them even though they aren't in visibleTabs; otherwise fall back to the first
  // permitted tab (e.g. after a role switch removes access to the current one).
  useEffect(() => {
    const menuScreens = ["profile", "subscription"];
    if (!visibleTabs.some((t) => t.id === tab) && !menuScreens.includes(tab)) {
      setTab(visibleTabs[0]?.id ?? "plan");
    }
  }, [visibleTabs, tab]);

  // Gate: no session → login / register.
  if (!account) {
    return <LoginScreen onSignedIn={setAccount} allowDemo={config.allowRoleSwitching} />;
  }

  return (
    <div className="page">
      <header className="topbar">
        <button type="button" className="brand" onClick={() => setTab("plan")}>
          <span className="brand-mark">▲</span>
          <span className="brand-name">You Go Further</span>
        </button>

        <nav className="topnav" aria-label="Primary">
          {visibleTabs.map((t) => (
            <button
              key={t.id}
              type="button"
              className={tab === t.id ? "topnav-tab active" : "topnav-tab"}
              onClick={() => setTab(t.id)}
            >
              {t.label}
            </button>
          ))}
        </nav>

        <AccountMenu
          account={account}
          gamification={gamification}
          allowRoleSwitching={config.allowRoleSwitching}
          canBilling={canBilling}
          onNavigate={setTab}
          onSwitchDemo={(p) => setAccount(signInAsDemo(p))}
          onSignOut={() => {
            clearSessionToken();
            setAccount(signOut());
          }}
        />
      </header>

      <div className="app-body">
        {tab === "plan" && <Planner role={account.role} onEditProfile={() => setTab("profile")} />}
        {tab === "progress" && gamification && <ProgressView profile={gamification} />}
        {tab === "profile" && <ProfileView account={account} />}
        {tab === "subscription" && <SubscriptionView tier={tier} onChoose={setTier} canBilling={canBilling} />}
        {tab === "connect" && <Dashboard tier={tier} />}
        {tab === "team" && <TeamView canExport={hasPermission(account, "data:export")} />}
        {tab === "catalog" && <CatalogView canEdit={hasPermission(account, "catalog:edit")} role={account.role} />}
        {tab === "admin" && <AdminView config={config} tier={tier} orgId={account.orgId} role={account.role} />}
      </div>

      <footer className="foot">
        {config.environment} · v{config.version} · General guidance for healthy adults — not medical
        advice. Provider connectors use official OAuth scopes; sample data is shown until a real account
        is linked.
      </footer>
    </div>
  );
}
