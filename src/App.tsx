import { useCallback, useEffect, useMemo, useState } from "react";
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
import { HomeView } from "./components/HomeView";
import { RaceImport } from "./components/RaceImport";
import { EventPlanner } from "./components/EventPlanner";
import { ToastHost } from "./components/ToastHost";
import { ConfirmHost } from "./components/ConfirmHost";
import { Onboarding } from "./components/Onboarding";
import { isOnboarded, setOnboarded, getOnboardStep } from "./api/onboarding";
import { toast } from "./ui/toast";
import { effectiveTier, type Tier } from "./subscription";
import { currentAccount, hasPermission, signInAsDemo, signOut, type Account, type Permission } from "./auth";
import { isSolo } from "./personas";
import { getConfig } from "./config";
import type { Activity } from "./model";
import { computeProgress, fuellingScore } from "./progress";
import { sportToActivity } from "./analysis";
import { addFeedback, loadFeedback } from "./api/feedbackStore";
import type { SessionFeedback } from "./feedback";
import { syncProfile, loadProfile } from "./api/profileStore";
import { api, clearSessionToken, setSessionToken, isApiConfigured } from "./api/client";
import { saveAccount } from "./auth";
import { useI18n, type TranslationKey } from "./i18n";
import { useTheme } from "./theme/useTheme";

interface TabDef {
  id: string;
  /** Translation key — the label is resolved at render, so it follows the language. */
  labelKey: TranslationKey;
  perm: Permission;
}

// Primary navigation — the core work surfaces. Personal screens (Profile,
// Subscription) live in the account menu, not here, so each is in one place.
const TABS: TabDef[] = [
  { id: "home", labelKey: "nav.home", perm: "plan:use" },
  { id: "plan", labelKey: "nav.plan", perm: "plan:use" },
  { id: "progress", labelKey: "nav.progress", perm: "plan:use" },
  { id: "connect", labelKey: "nav.connect", perm: "analysis:view_own" },
  { id: "team", labelKey: "nav.team", perm: "analysis:view_team" },
  { id: "catalog", labelKey: "nav.catalog", perm: "catalog:read" },
  { id: "admin", labelKey: "nav.admin", perm: "org:configure" },
];

export function App() {
  const config = useMemo(() => getConfig(), []);
  const { t, lang, setLang } = useI18n();
  // Applies data-theme to <html> and follows the OS while on "system".
  const { choice: themeChoice, setChoice: setThemeChoice } = useTheme();
  const [account, setAccount] = useState<Account | null>(() => currentAccount());
  // What the athlete is actually served. With subscriptions off (the Phase-1
  // free launch) that is the full feature set regardless of the stored plan.
  const [storedTier, setStoredTier] = useState<Tier>(account?.tier ?? "free");
  const tier = effectiveTier(storedTier, config.subscriptionsEnabled);
  const [tab, setTab] = useState<string>("home");
  // One-shot planner prefill, e.g. from "Plan for this route" in Connect.
  const [plannerPrefill, setPlannerPrefill] = useState<Partial<SessionInput>>();
  const [onboarding, setOnboarding] = useState(false);

  const [feedback, setFeedback] = useState<SessionFeedback[]>([]);
  const feedbackCount = feedback.length;
  // Which past session the athlete asked to review, carried from the start
  // screen into Connect so "How did it go?" lands on that exact run.
  const [reviewActivityId, setReviewActivityId] = useState<string>();

  const visibleTabs = useMemo(() => (account ? TABS.filter((t) => hasPermission(account, t.perm)) : []), [account]);
  // Billing only exists when there is something to bill for. The Phase-1 app is
  // free, so the screen and its menu entry are simply not there.
  const canBilling =
    config.subscriptionsEnabled && account
      ? hasPermission(account, "billing:manage") || isSolo(account)
      : false;

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

  /**
   * Log a past session against the activity it belongs to.
   *
   * Kept here rather than inside Connect because the log feeds three surfaces —
   * the debrief, the fuelling score and the planner's learned adaptation — and
   * they must all move at once. Passing the activity id is what makes the log
   * a debrief instead of an anonymous rating.
   */
  const logSession = useCallback(
    async (
      activityId: string,
      entry: Pick<SessionFeedback, "gi" | "energy" | "actualCarbPerHourG"> & {
        durationMin: number;
        plannedCarbPerHourG: number;
      },
    ) => {
      if (!account) return;
      try {
        setFeedback(await addFeedback(account.role, { ...entry, activityId }));
        toast.success(t("toast.sessionLogged"));
      } catch {
        toast.error(t("toast.saveFailed"));
      }
    },
    [account, t],
  );

  useEffect(() => {
    if (account) setStoredTier(account.tier);
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
      toast.success(t("toast.paymentReceived"));
      clean();
      // A plan bought just now isn't in the session token yet, so ask the server
      // what this account is entitled to rather than waiting for a re-login.
      api
        .me()
        .then((res) => {
          if (res.principal.tier !== storedTier) {
            setStoredTier(res.principal.tier);
            if (account) saveAccount({ ...account, tier: res.principal.tier });
            toast.success(t("toast.planActive", { tier: res.principal.tier }));
          }
        })
        .catch(() => undefined);
    }
    // Returning from a provider's consent screen: confirm it and land the athlete
    // on Connect, where their newly-synced sessions are.
    if (connected) {
      toast.success(t("toast.connected", { provider: `${connected[0].toUpperCase()}${connected.slice(1)}` }));
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
          setTab("home");
        }}
      />
    );
  }

  return (
    <div className="page">
      <a className="skip-link" href="#main">{t("app.skipToContent")}</a>
      <header className="topbar">
        <button type="button" className="brand" onClick={() => setTab("plan")}>
          <span className="brand-mark">▲</span>
          <span className="brand-name">{t("app.brand")}</span>
        </button>

        <nav className="topnav" aria-label={t("app.nav")}>
          {visibleTabs.map((t2) => (
            <button
              key={t2.id}
              type="button"
              className={tab === t2.id ? "topnav-tab active" : "topnav-tab"}
              onClick={() => setTab(t2.id)}
            >
              {t2.labelKey ? t(t2.labelKey) : ""}
            </button>
          ))}
        </nav>

        <AccountMenu
          account={account}
          progress={progress}
          allowRoleSwitching={config.allowRoleSwitching}
          canBilling={canBilling}
          onNavigate={setTab}
          lang={lang}
          onLang={setLang}
          themeChoice={themeChoice}
          onTheme={setThemeChoice}
          onSwitchDemo={(p) => {
            // A demo persona is not the signed-in account. Leaving the real
            // session token in place meant the server kept answering as the
            // original athlete, so "switch to Org admin" landed on an admin
            // screen full of permission errors. Drop the token and the client
            // is genuinely in demo mode as that persona.
            clearSessionToken();
            setAccount(signInAsDemo(p));
          }}
          onSignOut={() => {
            clearSessionToken();
            setAccount(signOut());
          }}
        />
      </header>

      <div className="app-body" id="main">
        {tab === "home" && (
          <HomeView
            account={account}
            progress={progress}
            fuelling={fuelling}
            activities={activities}
            feedback={feedback}
            hasSyncedData={hasSyncedData}
            onNavigate={setTab}
            onReviewSession={(a) => {
              // Straight to the debrief for that run, not to a generic screen
              // the athlete then has to search through.
              setReviewActivityId(a.id);
              setTab("connect");
            }}
            onFuelSession={(a) => {
              // Carry the session's own shape into the planner rather than
              // making the athlete retype it.
              setPlannerPrefill({
                activity: sportToActivity(a.sport),
                durationMin: Math.round(a.durationSec / 60),
              });
              setTab("plan");
            }}
          />
        )}
        {tab === "plan" && (
          <>
            {/* A named race first, because that is the question athletes
                actually arrive with — "the Jungfrau-Marathon is in nine weeks"
                — and its answer depends on a date the GPX below does not carry. */}
            <EventPlanner activities={activities} onPlan={setPlannerPrefill} />
            {/* The Phase-1 moment: a race you have not run yet, fuelled. It sits
                above the session planner because it is the reason to open this
                screen — planning a training session is the everyday case. */}
            <RaceImport onPlan={setPlannerPrefill} />
            <Planner initial={plannerPrefill} role={account.role} onEditProfile={() => setTab("profile")} />
          </>
        )}
        {tab === "progress" && progress && (
          <ProgressView profile={progress} fuelling={fuelling} hasData={hasSyncedData} onConnect={() => setTab("connect")} />
        )}
        {tab === "profile" && <ProfileView account={account} />}
        {tab === "subscription" && config.subscriptionsEnabled && (
          <SubscriptionView tier={storedTier} onChoose={setStoredTier} canBilling={canBilling} />
        )}
        {tab === "connect" && (
          <Dashboard
            tier={tier}
            feedback={feedback}
            onLogSession={logSession}
            focusActivityId={reviewActivityId}
            onEditProfile={() => setTab("profile")}
            onPlanRoute={(prefill) => {
              setPlannerPrefill(prefill);
              setTab("plan");
              toast.info(t("toast.planningRoute"));
            }}
          />
        )}
        {tab === "team" && <TeamView canExport={hasPermission(account, "data:export")} />}
        {tab === "catalog" && <CatalogView canEdit={hasPermission(account, "catalog:edit")} role={account.role} />}
        {tab === "admin" && <AdminView config={config} tier={tier} orgId={account.orgId} role={account.role} />}
      </div>

      <footer className="foot">
        {config.environment} · v{config.version} · {t("app.disclaimer")}
      </footer>

      <ToastHost />
      <ConfirmHost />
    </div>
  );
}
