import { useEffect, useMemo, useState } from "react";
import { Planner, type SessionInput } from "./components/Planner";
import { Dashboard } from "./components/Dashboard";
import { TeamView } from "./components/TeamView";
import { CatalogView } from "./components/CatalogView";
import { AdminView } from "./components/AdminView";
import { LoginScreen } from "./components/LoginScreen";
import { ProgressView } from "./components/ProgressView";
import { ProfileView } from "./components/ProfileView";
import { SubscriptionView } from "./components/SubscriptionView";
import { AccountMenu } from "./components/AccountMenu";
import { ToastHost } from "./components/ToastHost";
import { ConfirmHost } from "./components/ConfirmHost";
import { Onboarding } from "./components/Onboarding";
import { isOnboarded, setOnboarded, getOnboardStep } from "./api/onboarding";
import { toast } from "./ui/toast";
import { type Tier } from "./subscription";
import { currentAccount, hasPermission, signInAsDemo, signOut, type Account, type Permission } from "./auth";
import { isSolo } from "./personas";
import { getConfig } from "./config";
import type { Activity } from "./model";
import { computeProgress, fuellingScore } from "./progress";
import { loadFeedback } from "./api/feedbackStore";
import type { SessionFeedback } from "./feedback";
import { syncProfile, loadProfile } from "./api/profileStore";
import { api, clearSessionToken, setSessionToken, isApiConfigured } from "./api/client";
import { saveAccount } from "./auth";

interface TabDef {
  id: string;
  label: string;
  perm: Permission;
}

// Primary navigation — the core work surfaces. Personal screens (Profile,
// Subscription) live in the account menu, not here, so each is in one place.
const TABS: TabDef[] = [
  { id: "plan", label: "Plan", perm: "plan:use" },
  { id: "progress", label: "Insights", perm: "plan:use" },
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
  // One-shot planner prefill, e.g. from "Plan for this route" in Connect.
  const [plannerPrefill, setPlannerPrefill] = useState<Partial<SessionInput>>();
  const [onboarding, setOnboarding] = useState(false);

  const [feedback, setFeedback] = useState<SessionFeedback[]>([]);
  const feedbackCount = feedback.length;

  const visibleTabs = useMemo(() => (account ? TABS.filter((t) => hasPermission(account, t.perm)) : []), [account]);
  const canBilling = account ? hasPermission(account, "billing:manage") || isSolo(account) : false;

  // Insights are built from the athlete's **own** synced sessions — never from
  // sample data — so the numbers on screen are always really theirs.
  const [activities, setActivities] = useState<Activity[]>([]);
  const [connectionsCount, setConnectionsCount] = useState(0);
  const progress = useMemo(
    () =>
      account
        ? computeProgress({
            activities,
            feedbackCount,
            connectionsCount,
            hasMeasuredSweatRate: loadProfile().useSignals,
          })
        : null,
    [account, activities, feedbackCount, connectionsCount],
  );
  const hasSyncedData = activities.length > 0;
  // How well the athlete is actually fuelling — and what to change next.
  const fuelling = useMemo(
    () =>
      fuellingScore({
        feedback,
        longSessions: activities.filter((a) => a.durationSec >= 90 * 60).length,
        connectionsCount,
        hasMeasuredSweatRate: loadProfile().useSignals,
      }),
    [feedback, activities, connectionsCount],
  );

  useEffect(() => {
    if (account) setTier(account.tier);
  }, [account]);
  useEffect(() => {
    if (!account) return;
    let alive = true;
    loadFeedback(account.role)
      .then((list) => alive && setFeedback(list))
      .catch(() => {});
    // Real synced sessions + connections (empty in the API-less build).
    if (isApiConfigured()) {
      api
        .activities()
        .then((r) => alive && setActivities(r.activities))
        .catch(() => {});
      api
        .connections()
        .then((r) => alive && setConnectionsCount(r.connections.length))
        .catch(() => {});
    }
    // The profile is authoritative on the server — refresh the local cache.
    void syncProfile();
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

  // The planner prefill is one-shot: the Planner reads it on mount, then we clear
  // it so later visits to Plan start from the user's own defaults.
  useEffect(() => {
    if (tab !== "plan" || !plannerPrefill) return;
    const t = setTimeout(() => setPlannerPrefill(undefined), 0);
    return () => clearTimeout(t);
  }, [tab, plannerPrefill]);

  // Redeem an emailed magic link (?magic=…) and confirm a completed payment
  // (?paid=…) on load, then clean the URL so a refresh can't replay either.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const magic = params.get("magic");
    const paid = params.get("paid");
    const connected = params.get("connected");
    if (!magic && !paid && !connected) return;
    const clean = () => window.history.replaceState({}, "", window.location.pathname);
    if (paid) {
      toast.success("Payment received — thank you!");
      clean();
    }
    // Returning from a provider's consent screen: confirm it and land the athlete
    // on Connect, where their newly-synced sessions are.
    if (connected) {
      toast.success(`${connected[0].toUpperCase()}${connected.slice(1)} connected — your sessions are syncing.`);
      setTab("connect");
      clean();
    }
    if (magic) {
      api
        .emailLinkVerify(magic)
        .then((res) => {
          setSessionToken(res.token);
          setAccount(
            saveAccount({
              id: res.account.id,
              name: res.account.name,
              email: res.account.email,
              role: res.account.role,
              tier: res.account.tier,
              authProvider: "email",
              createdAt: new Date().toISOString(),
            }),
          );
          toast.success(`Signed in as ${res.account.email}`);
        })
        .catch((e: unknown) => toast.error(e instanceof Error ? e.message : "That sign-in link is no longer valid."))
        .finally(clean);
    }
  }, []);

  // First-run guided journey — shown once per browser after the first sign-in.
  useEffect(() => {
    if (account && !isOnboarded()) setOnboarding(true);
  }, [account]);

  // Gate: no session → login / register.
  if (!account) {
    return <LoginScreen onSignedIn={setAccount} allowDemo={config.allowRoleSwitching} />;
  }

  if (onboarding) {
    return (
      <Onboarding
        account={account}
        initialStep={getOnboardStep()}
        onFinish={() => {
          setOnboarded();
          setOnboarding(false);
          setTab("plan");
        }}
      />
    );
  }

  return (
    <div className="page">
      <a className="skip-link" href="#main">Skip to content</a>
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
          progress={progress}
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

      <div className="app-body" id="main">
        {tab === "plan" && (
          <Planner initial={plannerPrefill} role={account.role} onEditProfile={() => setTab("profile")} />
        )}
        {tab === "progress" && progress && (
          <ProgressView profile={progress} fuelling={fuelling} hasData={hasSyncedData} onConnect={() => setTab("connect")} />
        )}
        {tab === "profile" && <ProfileView account={account} />}
        {tab === "subscription" && <SubscriptionView tier={tier} onChoose={setTier} canBilling={canBilling} />}
        {tab === "connect" && (
          <Dashboard
            tier={tier}
            onPlanRoute={(prefill) => {
              setPlannerPrefill(prefill);
              setTab("plan");
              toast.info("Planning for your route — conditions applied");
            }}
          />
        )}
        {tab === "team" && <TeamView canExport={hasPermission(account, "data:export")} />}
        {tab === "catalog" && <CatalogView canEdit={hasPermission(account, "catalog:edit")} role={account.role} />}
        {tab === "admin" && <AdminView config={config} tier={tier} orgId={account.orgId} role={account.role} />}
      </div>

      <footer className="foot">
        {config.environment} · v{config.version} · General guidance for healthy adults — not medical
        advice. Provider connectors use official OAuth scopes; sample data is shown until a real account
        is linked.
      </footer>

      <ToastHost />
      <ConfirmHost />
    </div>
  );
}
