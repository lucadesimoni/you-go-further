import { useMemo } from "react";
import type { Account } from "../auth";
import type { Activity } from "../model";
import type { FuellingScore, ProgressProfile } from "../progress";
import {
  GREETING_KEY,
  GREETING_KEY_NO_NAME,
  dayPart,
  greetableName,
  longestRecent,
  recentSessions,
  shortcutsFor,
  weekSummary,
} from "../home";
import { formatClock } from "../engine";
import { logForActivity } from "../analysis";
import type { SessionFeedback } from "../feedback";
import { FailedBlock, LoadingBlock, type LoadState } from "./LoadState";
import { loadProfile } from "../api/profileStore";
import { useI18n, type TranslationKey } from "../i18n";
import { actionText } from "../i18n/actions";
import { Stat } from "./Stat";
import { Icon, type IconName } from "./Icon";

const BAND_KEY: Record<FuellingScore["band"], TranslationKey> = {
  "getting-started": "insights.bandGettingStarted",
  building: "insights.bandBuilding",
  solid: "insights.bandSolid",
  "dialled-in": "insights.bandDialledIn",
};

/** The sport's own shape, so a run is findable in a list of identical rows. */
const SPORT_ICON: Record<string, IconName> = {
  run: "run",
  "trail-run": "trail",
  ride: "bike",
  swim: "swim",
  triathlon: "triathlon",
};

const SPORT_KEY: Record<string, TranslationKey> = {
  run: "activity.running",
  "trail-run": "activity.trail-running",
  ride: "activity.cycling",
  swim: "activity.swimming",
  triathlon: "activity.triathlon",
};

/**
 * The start screen — what an athlete sees the moment they sign in.
 *
 * It answers one question: **what should I do today?** So the single most useful
 * action comes first, at full width, taken straight from the fuelling score's
 * own reasoning rather than a second, competing rule set. Everything below it is
 * context for that decision — the week, the score, the last few sessions — and
 * nothing is invented: an athlete with no synced data is told so rather than
 * shown zeros dressed up as achievement.
 *
 * It serves every signed-in role. Staff get their tools as well, below the
 * athlete cards, because coaches and owners train too.
 */
export function HomeView({
  account,
  progress,
  fuelling,
  activities,
  feedback = [],
  hasSyncedData,
  dataState = "ready",
  onRetry,
  onNavigate,
  onFuelSession,
  onReviewSession,
}: {
  account: Account;
  progress: ProgressProfile | null;
  fuelling: FuellingScore;
  activities: Activity[];
  /** Logs, so a session that's already been reviewed doesn't ask again. */
  feedback?: SessionFeedback[];
  hasSyncedData: boolean;
  /** Whether the athlete's sessions have arrived, are coming, or failed. */
  dataState?: LoadState;
  onRetry?: () => void;
  onNavigate: (tab: string, planMode?: "race" | "route" | "session") => void;
  /** Plan for a specific past session — carries its shape into the planner. */
  onFuelSession?: (a: Activity) => void;
  /** Open the debrief for a past session. */
  onReviewSession?: (a: Activity) => void;
}) {
  const { t, lang } = useI18n();
  const week = useMemo(() => weekSummary(activities), [activities]);
  const recent = useMemo(() => recentSessions(activities, 3), [activities]);
  const longest = useMemo(() => longestRecent(activities), [activities]);
  const shortcuts = useMemo(() => shortcutsFor(account.role), [account.role]);
  /*
   * Every session that has actually been run can be judged — a track is not the
   * qualification.
   *
   * It used to be: `a.route && a.route.length > 1`. A GPS track is what the map
   * and the terrain plan need, not what rating how a session felt needs, and
   * requiring one meant an athlete who runs without GPS could never review a
   * session — so they met an anonymous rating form on the *planner* instead, a
   * screen for sessions that have not happened yet. `RoutePanel` now shows the
   * debrief on its own for a track-less session.
   */
  const reviewable = useMemo(
    () => recent.filter((a) => !logForActivity(feedback, a.id)),
    [recent, feedback],
  );
  const bodyProfile = useMemo(() => loadProfile(), []);

  const part = dayPart(new Date().getHours());
  const firstName = greetableName(account.name);
  const greeting = firstName
    ? t(GREETING_KEY[part], { name: firstName })
    : t(GREETING_KEY_NO_NAME[part]);
  // The score already ranks what matters most; reusing it keeps the home screen
  // and the insights screen from ever giving contradictory advice.
  const next = fuelling.nextActions[0];
  const nextText = next ? actionText(next, t) : null;

  const dateFmt = new Intl.DateTimeFormat(lang === "de" ? "de-CH" : "en-GB", { day: "numeric", month: "short" });

  return (
    <main className="dash home">
      <section className="home-hero">
        <div className="home-hero-text">
          <h1 className="home-greeting">{greeting}</h1>
          {progress && hasSyncedData && progress.streakDays > 0 && (
            <p className="home-sub">{t("insights.streak", { days: progress.streakDays, best: progress.longestStreakDays })}</p>
          )}
        </div>
        <div className="home-readiness">
          {/* Neutral unless it means something. Red is the alert colour
              everywhere else in the app, and a middling readiness is not an
              alert — it was reading as one purely because the figure was
              decorated with the brand accent. */}
          <span
            className={`home-readiness-value${bodyProfile.readiness < 45 ? " home-readiness-low" : ""}`}
          >
            {bodyProfile.readiness}
          </span>
          <span className="home-readiness-label">{t("home.readiness")}</span>
          <span className="home-readiness-src">
            {bodyProfile.useSignals ? t("home.readinessMeasured") : t("home.readinessSelf")}
          </span>
        </div>
      </section>

      {/* The one thing to do, front and centre. */}
      {next && (
        <section className="panel panel-card home-next">
          <span className="home-next-kicker">{t("home.doNext")}</span>
          <h2 className="home-next-title">{nextText!.title}</h2>
          <p className="home-next-why">{nextText!.why}</p>
          <div className="home-next-actions">
            <button type="button" className="btn btn-primary" onClick={() => onNavigate("plan", "session")}>
              {t("home.planSession")}
            </button>
            {/* A race is the reason most athletes open this at all — give it its
                own way in, not just "plan a session". */}
            <button type="button" className="btn btn-ghost" onClick={() => onNavigate("plan", "race")}>
              {t("home.planRace")}
            </button>
            {/* "Log a session" is only useful if it leads somewhere concrete.
                When a real run is waiting to be reviewed, go straight to it. */}
            {reviewable.length > 0 && onReviewSession ? (
              <button type="button" className="btn btn-ghost" onClick={() => onReviewSession(reviewable[0])}>
                {t("home.reviewIt")}
              </button>
            ) : (
              <button type="button" className="btn btn-ghost" onClick={() => onNavigate("progress")}>
                {t("home.logSession")}
              </button>
            )}
          </div>
        </section>
      )}

      <div className="home-grid">
        <section className="panel">
          <div className="section-head">
            <h2>{t("home.thisWeek")}</h2>
          </div>
          {dataState === "loading" ? (
            <LoadingBlock lines={4} />
          ) : dataState === "failed" ? (
            <FailedBlock onRetry={onRetry} />
          ) : hasSyncedData ? (
            <>
              <div className="targets plain-grid">
                <Stat label={t("home.sessions")} value={String(week.sessions)} />
                {/*
                  The change sits on the figure it is about. As a pill in the
                  header it described "this week" in general, so a reader had to
                  work out which of four numbers had moved — and on a tablet it
                  wrapped the heading onto two lines to say it.
                */}
                <Stat
                  label={t("home.hours")}
                  value={String(week.hours)}
                  unit="h"
                  delta={
                    week.hasComparison
                      ? {
                          text: t("home.vsPrevious", { delta: String(Math.abs(week.deltaHours)) }),
                          direction: week.deltaHours > 0 ? "up" : week.deltaHours < 0 ? "down" : "flat",
                        }
                      : undefined
                  }
                />
                <Stat label={t("home.distance")} value={String(week.distanceKm)} unit="km" />
                <Stat label={t("home.climb")} value={String(week.elevationM)} unit="m" />
              </div>
              {week.sessions === 0 && <p className="detail">{t("home.quietWeek")}</p>}
              {!week.hasComparison && week.sessions > 0 && <p className="detail">{t("home.firstWeek")}</p>}
            </>
          ) : (
            <div className="empty-state">
              <p style={{ margin: 0 }}>{t("home.noSessions")}</p>
              <button type="button" className="btn btn-primary mt-5" onClick={() => onNavigate("connect")}>
                {t("insights.connectService")}
              </button>
            </div>
          )}
        </section>

        <section className="panel panel-card home-score">
          <div className="section-head">
            <h2>{t("home.fuelling")}</h2>
            <span className="pill">{t("insights.sessionsLogged", { count: fuelling.sessionsLogged })}</span>
          </div>
          <div className="home-score-body">
            <span className={`home-score-value score-${fuelling.band}`}>
              {fuelling.score ?? "—"}
            </span>
            <span className="home-score-band">
              {fuelling.score === null ? t("home.notScoredYet") : t(BAND_KEY[fuelling.band])}
            </span>
          </div>
          {fuelling.healthFlags.length > 0 && <p className="home-flag">{fuelling.healthFlags[0]}</p>}
          <button type="button" className="link-btn" onClick={() => onNavigate("progress")}>
            {t("home.openInsights")}
          </button>
        </section>
      </div>

      {hasSyncedData && recent.length > 0 && (
        <section className="panel">
          <div className="section-head">
            <h2>{t("home.recent")}</h2>
            {/* The nudge that actually closes the loop: how many of these still
                have no debrief. Only shown when there is something to do. */}
            {reviewable.length > 0 && onReviewSession ? (
              <span className="pill pill-todo">{t("home.reviewPending", { count: reviewable.length })}</span>
            ) : (
              longest && (
                <span className="pill">
                  {t("home.longestRecent")} · {formatClock(Math.round(longest.durationSec / 60))}
                </span>
              )
            )}
          </div>
          {/*
            The newest session gets a card; the ones behind it get rows.
            
            One rich block and then a list is how a training feed reads: the
            session you just finished is the one you came to look at, and the
            two before it are context. Rendering all three identically made the
            most recent one findable only by its date.
          */}
          {recent[0] && (
            <article className="session-feature">
              <div className="session-feature-head">
                <span className={`row-disc sport-${recent[0].sport}`} aria-hidden>
                  <Icon name={SPORT_ICON[recent[0].sport] ?? "session"} />
                </span>
                <div className="session-feature-id">
                  <h3 className="session-feature-name">
                    {recent[0].name?.trim() ||
                      (SPORT_KEY[recent[0].sport] ? t(SPORT_KEY[recent[0].sport]) : recent[0].sport)}
                  </h3>
                  <span className="session-feature-when">{dateFmt.format(new Date(recent[0].startTime))}</span>
                </div>
                {logForActivity(feedback, recent[0].id) ? (
                  <span className="pill pill-done">{t("home.logged")}</span>
                ) : (
                  <span className="pill pill-todo">{t("debrief.notLogged")}</span>
                )}
              </div>

              {/* The three figures a session is recognised by, labelled. */}
              <div className="session-feature-figs">
                <Stat label={t("plan.duration")} value={formatClock(Math.round(recent[0].durationSec / 60))} />
                {recent[0].distanceM != null && (
                  <Stat label={t("home.distance")} value={(recent[0].distanceM / 1000).toFixed(1)} unit="km" />
                )}
                {recent[0].elevationGainM != null && (
                  <Stat label={t("home.climb")} value={String(recent[0].elevationGainM)} unit="m" />
                )}
              </div>

              <div className="session-feature-actions">
                {onReviewSession && !logForActivity(feedback, recent[0].id) && (
                  <button type="button" className="btn btn-primary" onClick={() => onReviewSession(recent[0])}>
                    {t("home.reviewIt")}
                  </button>
                )}
                {onFuelSession && (
                  <button type="button" className="btn btn-ghost" onClick={() => onFuelSession(recent[0])}>
                    {t("home.fuelIt")}
                  </button>
                )}
              </div>
            </article>
          )}

          <ul className="home-sessions">
            {recent.slice(1).map((a) => (
              <li key={a.id} className="home-session">
                <span className={`home-session-icon sport-${a.sport}`} aria-hidden>
                  <Icon name={SPORT_ICON[a.sport] ?? "session"} />
                </span>
                <span className="home-session-date">{dateFmt.format(new Date(a.startTime))}</span>
                {/* The athlete's own title when the provider sent one — that is
                    what they recognise the session by. "Trail running" is the
                    fallback for a session that arrived without a name, not the
                    thing to show instead of "Hill repeats". */}
                <span className="home-session-sport">
                  {a.name?.trim() || (SPORT_KEY[a.sport] ? t(SPORT_KEY[a.sport]) : a.sport)}
                </span>
                {/*
                  The same metric language as the cards above: the figure
                  carries, the unit is subordinate. As one run-on string —
                  "11.6 km · 0:54 · ↑ 63 m" — every part had equal weight and
                  the numbers had to be picked out of the punctuation.
                */}
                <span className="home-session-figs">
                  {a.distanceM != null && (
                    <span className="fig">
                      {(a.distanceM / 1000).toFixed(1)} <span className="fig-unit">km</span>
                    </span>
                  )}
                  <span className="fig">{formatClock(Math.round(a.durationSec / 60))}</span>
                  {a.elevationGainM ? (
                    <span className="fig">
                      ↑ {a.elevationGainM} <span className="fig-unit">m</span>
                    </span>
                  ) : null}
                </span>
                <span className="home-session-actions">
                  {/* An unreviewed run gets the question first — the debrief is
                      worth more than another plan, and it feeds the next one. */}
                  {onReviewSession && (
                    logForActivity(feedback, a.id) ? (
                      <span className="pill pill-done">{t("home.logged")}</span>
                    ) : (
                      <button type="button" className="link-btn link-strong" onClick={() => onReviewSession(a)}>
                        {t("home.reviewIt")}
                      </button>
                    )
                  )}
                  {onFuelSession && (
                    <button type="button" className="link-btn home-session-plan" onClick={() => onFuelSession(a)}>
                      {t("home.fuelIt")}
                    </button>
                  )}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {shortcuts.length > 0 && (
        <section className="panel">
          <div className="section-head">
            <h2>{t("home.shortcuts")}</h2>
          </div>
          <div className="home-shortcuts">
            {shortcuts.map((s) => (
              <button key={s.id} type="button" className="home-shortcut" onClick={() => onNavigate(s.id)}>
                <span className="home-shortcut-label">{t(s.labelKey)}</span>
                <span className="home-shortcut-why">{t(s.descriptionKey)}</span>
              </button>
            ))}
          </div>
        </section>
      )}
    </main>
  );
}
