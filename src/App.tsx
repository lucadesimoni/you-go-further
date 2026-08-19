import { useCallback, useEffect, useMemo, useState } from "react";
import { Planner, type SessionInput } from "./components/Planner";
import { Dashboard } from "./components/Dashboard";
import { TeamView } from "./components/TeamView";
import { CatalogView } from "./components/CatalogView";
import { AdminView } from "./components/AdminView";
import { LandingView } from "./components/LandingView";
import { ProgressView } from "./components/ProgressView";
import { ProfileView } from "./components/ProfileView";
import { PrivacyView } from "./components/PrivacyView";
import { SubscriptionView } from "./components/SubscriptionView";
import { AccountMenu } from "./components/AccountMenu";
import { HomeView } from "./components/HomeView";
import { RoutePanel } from "./components/RoutePanel";
import { NutritionGuide } from "./components/NutritionGuide";
import { useMediaQuery, COMPACT_NAV } from "./ui/useMediaQuery";
import { EventPlanner } from "./components/EventPlanner";
import { ToastHost } from "./components/ToastHost";
import { OfflineBanner } from "./components/OfflineBanner";
import { ConfirmHost } from "./components/ConfirmHost";
import { Onboarding } from "./components/Onboarding";
import { isOnboarded, setOnboarded, getOnboardStep, enterDemo, seedDemoFeedback, connectDemoSource } from "./api/onboarding";
import { toast } from "./ui/toast";
import { effectiveTier, type Tier } from "./subscription";
import { currentAccount, hasPermission, signOut, type Account, type Permission } from "./auth";
import { isSolo } from "./personas";
import { getConfig } from "./config";
import type { Activity } from "./model";
import { computeProgress, fuellingScore } from "./progress";
import { sportToActivity } from "./analysis";
import { addFeedback, loadFeedback } from "./api/feedbackStore";
import type { SessionFeedback } from "./feedback";
import { loadProfile } from "./api/profileStore";
import { api, clearSessionToken, setSessionToken } from "./api/client";
import { loadActivities, loadConnections } from "./api/trainingData";
import type { LoadState } from "./components/LoadState";
import { saveAccount } from "./auth";
import { useI18n, type TranslationKey } from "./i18n";
import { useTheme } from "./theme/useTheme";
import { Icon, type IconName } from "./components/Icon";

/** The three jobs the Plan screen does, one at a time. */
/**
 * The tabs a phone shows in its bottom bar.
 *
 * Seven navigation targets do not fit across a phone, and cramming them in is
 * how a bar becomes a row of unreadable four-letter words. These four are what
 * an athlete opens most days; everything else is one tap away behind "More",
 * which is what that key was written for. On a tablet or a desktop the whole
 * set is on screen and there is no "More" at all.
 */
const PHONE_TABS = ["home", "plan", "progress", "catalog"];

export type PlanMode = "race" | "route" | "session";

const PLAN_MODES: { id: PlanMode; labelKey: TranslationKey; blurbKey: TranslationKey; icon: IconName }[] = [
  { id: "race", labelKey: "plan.modeRace", blurbKey: "plan.modeRaceWhy", icon: "race" },
  { id: "route", labelKey: "plan.modeRoute", blurbKey: "plan.modeRouteWhy", icon: "route" },
  { id: "session", labelKey: "plan.modeSession", blurbKey: "plan.modeSessionWhy", icon: "session" },
];

interface TabDef {
  id: string;
  /** Translation key — the label is resolved at render, so it follows the language. */
  labelKey: TranslationKey;
  perm: Permission;
  /** Shown beside the label, and alone on the mobile bar. */
  icon: IconName;
}

// Primary navigation — the core work surfaces. Personal screens (Profile,
// Subscription) live in the account menu, not here, so each is in one place.
const TABS: TabDef[] = [
  { id: "home", labelKey: "nav.home", perm: "plan:use", icon: "home" },
  { id: "plan", labelKey: "nav.plan", perm: "plan:use", icon: "plan" },
  { id: "progress", labelKey: "nav.progress", perm: "plan:use", icon: "insights" },
  { id: "connect", labelKey: "nav.connect", perm: "analysis:view_own", icon: "connect" },
  { id: "team", labelKey: "nav.team", perm: "analysis:view_team", icon: "team" },
  { id: "catalog", labelKey: "nav.catalog", perm: "catalog:read", icon: "catalog" },
  { id: "guide", labelKey: "nav.guide", perm: "plan:use", icon: "guide" },
  { id: "admin", labelKey: "nav.admin", perm: "org:configure", icon: "admin" },
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
  /**
   * Which of the three planning jobs the Plan screen is doing.
   *
   * They used to be stacked: a named race, a GPX import and the session planner
   * on one page, 6.7 screens deep with 53 controls. Three different jobs, and an
   * athlete opening the screen wants one of them — so it shows one.
   */
  const [planMode, setPlanMode] = useState<PlanMode>("race");
  // One-shot planner prefill, e.g. from "Plan for this route" in Connect.
  const [plannerPrefill, setPlannerPrefill] = useState<Partial<SessionInput>>();
  const [onboarding, setOnboarding] = useState(false);

  const [feedback, setFeedback] = useState<SessionFeedback[]>([]);
  const feedbackCount = feedback.length;
  // Which past session the athlete asked to review, carried from the start
  // screen into Connect so "How did it go?" lands on that exact run.
  const [reviewActivityId, setReviewActivityId] = useState<string>();

  const visibleTabs = useMemo(() => (account ? TABS.filter((t) => hasPermission(account, t.perm)) : []), [account]);
  // Whether the strip has room for every label — a tablet in portrait does not,
  // and used to clip the last destination rather than admit it.
  const compactNav = useMediaQuery(COMPACT_NAV);
  const [moreOpen, setMoreOpen] = useState(false);
  const barTabs = compactNav ? visibleTabs.filter((t2) => PHONE_TABS.includes(t2.id)) : visibleTabs;
  const overflowTabs = compactNav ? visibleTabs.filter((t2) => !PHONE_TABS.includes(t2.id)) : [];
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
  /**
   * Whether the athlete's training has arrived, is still coming, or failed.
   *
   * Without this the three were one: `activities` started empty, and a failed
   * fetch was caught into an empty array, so a slow connection and a dead
   * server both rendered "No sessions yet — connect a service" to an athlete
   * who had done exactly that. Telling someone their training is gone is the
   * worst thing this screen can say, and it was saying it by default.
   */
  const [dataState, setDataState] = useState<LoadState>("loading");
  const [reloadKey, setReloadKey] = useState(0);
  const retryLoad = useCallback(() => {
    setDataState("loading");
    setReloadKey((n) => n + 1);
  }, []);
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
    /**
     * Load this athlete's world: connections, sessions, logs.
     *
     * One path, whether or not there is a server behind it. It used to fork —
     * with an API the whole bootstrap ran, without one it loaded the logs and
     * stopped — so the client-side build (which is what a demo runs on) opened
     * on an empty Home with nothing to explore, and connecting a provider on
     * the Connect screen was forgotten the moment you left it.
     */
    void (async () => {
      const isDemo = account.authProvider === "demo";
      // A demo account arrives connected. A real athlete's first job is to
      // choose a provider and go through consent, which is right for them and
      // absurd for someone who clicked "show me the product".
      if (isDemo) await connectDemoSource().catch(() => false);
      // `allSettled`, not `all`: one endpoint being down should not blank the
      // two that answered. What it must not do is look like an empty account.
      const [actsR, connsR, logsR] = await Promise.allSettled([
        loadActivities(),
        loadConnections(),
        loadFeedback(account.role),
      ]);
      if (!alive) return;
      const acts = actsR.status === "fulfilled" ? actsR.value : [];
      const conns = connsR.status === "fulfilled" ? connsR.value : [];
      setFeedback(logsR.status === "fulfilled" ? logsR.value : []);
      setConnectionsCount(conns.length);
      setActivities(acts);
      setDataState(actsR.status === "fulfilled" ? "ready" : "failed");
      // A demo account also gets a few session logs the first time, so the
      // half of the product that *learns* from outcomes has something to
      // show. A real athlete is never seeded — their logs are their own.
      //
      // The "first time" is judged from the stored logs, not a local flag:
      // the logs live on the server, so a flag in this browser let every
      // fresh window seed another three on top of the last.
      const logs = logsR.status === "fulfilled" ? logsR.value : [];
      if (isDemo && acts.length > 0 && logs.length === 0) {
        await seedDemoFeedback(acts, account.role, addFeedback);
        const seeded = await loadFeedback(account.role).catch(() => null);
        if (alive && seeded) setFeedback(seeded);
      }
    })();
    return () => {
      alive = false;
    };
  }, [account, reloadKey]);
  /**
   * Escape closes the overflow sheet.
   *
   * It only closed by tapping the scrim — the strip of screen around it. On a
   * keyboard there was no way out at all, and on a phone the target is a
   * margin. Escape is what everyone tries first when a panel is in the way.
   */
  useEffect(() => {
    if (!moreOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setMoreOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [moreOpen]);

  // Profile & Subscription are reached from the account menu, not the nav — allow
  // them even though they aren't in visibleTabs; otherwise fall back to the first
  // permitted tab (e.g. after a role switch removes access to the current one).
  useEffect(() => {
    // Only once there is an account. Signed out, `visibleTabs` is empty, so this
    // used to "correct" the default Home tab to Plan before anyone had signed in
    // — and the choice stuck, because Plan is permitted once they do. Onboarding
    // hid it by setting the tab itself at the end; skip onboarding, as a demo
    // account now does, and you landed on Plan instead of your own start screen.
    if (!account) return;
    const menuScreens = ["profile", "subscription", "privacy"];
    if (!visibleTabs.some((t) => t.id === tab) && !menuScreens.includes(tab)) {
      setTab(visibleTabs[0]?.id ?? "plan");
    }
  }, [account, visibleTabs, tab]);

  /**
   * Carry a session shape into the planner.
   *
   * The prefill is one-shot — later visits to Plan start from the athlete's own
   * defaults — but "one-shot" used to mean "cleared by a timer a tick later",
   * which quietly broke every caller that was *already* on the Plan screen.
   * "Plan for this race" and "Plan for this route" both are: the planner was
   * mounted, never re-read the value, and the button did nothing at all. The
   * planner now reports when it has taken the prefill, and that is what clears
   * it — no timer, and no way for the two to disagree.
   *
   * Scrolling is part of the answer, not a flourish: on the Plan screen the
   * planner sits below the race panels, so without it the athlete presses a
   * button and everything that changed is off-screen.
   */
  const planFor = useCallback((prefill: Partial<SessionInput>) => {
    setPlannerPrefill(prefill);
    setTab("plan");
    // The planner has to be on screen to receive it. Carrying a race into a
    // planner that is not rendered is the same silent nothing as before.
    setPlanMode("session");
    requestAnimationFrame(() =>
      document.getElementById("session-planner")?.scrollIntoView({ behavior: "smooth", block: "start" }),
    );
  }, []);

  /** Stable so the planner's effect does not re-run on every render. */
  const clearPrefill = useCallback(() => setPlannerPrefill(undefined), []);

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

  // Gate: no session → the landing page, which carries the sign-in card in its
  // hero. The card used to be the *whole* logged-out surface: it asked for an
  // email address without ever saying what the thing does.
  if (!account) {
    return <LandingView onSignedIn={setAccount} allowDemo={config.allowRoleSwitching} />;
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
          {barTabs.map((t2) => (
            <button
              key={t2.id}
              type="button"
              className={tab === t2.id ? "topnav-tab active" : "topnav-tab"}
              onClick={() => {
                setMoreOpen(false);
                setTab(t2.id);
              }}
            >
              <Icon name={t2.icon} />
              <span className="topnav-label">{t2.labelKey ? t(t2.labelKey) : ""}</span>
            </button>
          ))}
          {overflowTabs.length > 0 && (
            <button
              type="button"
              className={
                overflowTabs.some((t2) => t2.id === tab) ? "topnav-tab topnav-more active" : "topnav-tab topnav-more"
              }
              aria-expanded={moreOpen}
              onClick={() => setMoreOpen((v) => !v)}
            >
              <Icon name="more" />
              <span className="topnav-label">{t("nav.more")}</span>
            </button>
          )}
        </nav>

        {/* The rest of the navigation, as a sheet over the bar it came from. */}
        {moreOpen && overflowTabs.length > 0 && (
          <>
            <div className="nav-sheet-scrim" onClick={() => setMoreOpen(false)} />
            <div className="nav-sheet" role="menu" aria-label={t("nav.more")}>
              {overflowTabs.map((t2) => (
                <button
                  key={t2.id}
                  type="button"
                  role="menuitem"
                  className={tab === t2.id ? "nav-sheet-item active" : "nav-sheet-item"}
                  onClick={() => {
                    setMoreOpen(false);
                    setTab(t2.id);
                  }}
                >
                  <Icon name={t2.icon} />
                  <span>{t2.labelKey ? t(t2.labelKey) : ""}</span>
                </button>
              ))}
            </div>
          </>
        )}

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
            // Same entry as the sign-in screen: a demo persona arrives set up,
            // with their own body profile, rather than in a setup wizard.
            setAccount(enterDemo(p));
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
            dataState={dataState}
            onRetry={retryLoad}
            onNavigate={(next, mode) => {
              if (mode) setPlanMode(mode);
              setTab(next);
            }}
            onReviewSession={(a) => {
              // Straight to the debrief for that run, not to a generic screen
              // the athlete then has to search through.
              setReviewActivityId(a.id);
              setPlanMode("route");
              setTab("plan");
            }}
            onFuelSession={(a) => {
              // Carry the session's own shape into the planner rather than
              // making the athlete retype it.
              planFor({
                activity: sportToActivity(a.sport),
                durationMin: Math.round(a.durationSec / 60),
              });
            }}
          />
        )}
        {tab === "plan" && (
          <>
            <nav className="plan-modes" aria-label={t("plan.whatToPlan")}>
              {PLAN_MODES.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  className={planMode === m.id ? "plan-mode active" : "plan-mode"}
                  aria-pressed={planMode === m.id}
                  onClick={() => setPlanMode(m.id)}
                >
                  <Icon name={m.icon} />
                  <span className="plan-mode-name">{t(m.labelKey)}</span>
                  <span className="plan-mode-why">{t(m.blurbKey)}</span>
                </button>
              ))}
            </nav>

            {planMode === "race" && (
              <EventPlanner
                activities={activities}
                feedback={feedback}
                onPlan={(prefill) => {
                  planFor(prefill);
                  toast.info(t("toast.planningRace"));
                }}
              />
            )}
            {planMode === "route" && (
              <RoutePanel
                activities={activities}
                feedback={feedback}
                onLogSession={logSession}
                focusActivityId={reviewActivityId}
                onPlan={(prefill) => {
                  planFor(prefill);
                  toast.info(t("toast.planningRoute"));
                }}
              />
            )}
            {planMode === "session" && (
              <Planner
                initial={plannerPrefill}
                role={account.role}
                onEditProfile={() => setTab("profile")}
                onPrefillUsed={clearPrefill}
              />
            )}
          </>
        )}
        {tab === "progress" && progress && (
          <ProgressView
            profile={progress}
            fuelling={fuelling}
            hasData={hasSyncedData}
            activities={activities}
            feedback={feedback}
            dataState={dataState}
            onRetry={retryLoad}
            onConnect={() => setTab("connect")}
          />
        )}
        {tab === "profile" && <ProfileView account={account} />}
        {tab === "privacy" && <PrivacyView account={account} />}
        {tab === "subscription" && config.subscriptionsEnabled && (
          <SubscriptionView tier={storedTier} onChoose={setStoredTier} canBilling={canBilling} />
        )}
        {tab === "connect" && (
          <Dashboard tier={tier} onEditProfile={() => setTab("profile")} />
        )}
        {tab === "guide" && <NutritionGuide />}
        {tab === "team" && <TeamView canExport={hasPermission(account, "data:export")} />}
        {tab === "catalog" && <CatalogView canEdit={hasPermission(account, "catalog:edit")} role={account.role} />}
        {tab === "admin" && <AdminView config={config} tier={tier} orgId={account.orgId} role={account.role} />}
      </div>

      <footer className="foot">
        {config.environment} · v{config.version} · {t("app.disclaimer")}
      </footer>

      <OfflineBanner />
      <ToastHost />
      <ConfirmHost />
    </div>
  );
}
