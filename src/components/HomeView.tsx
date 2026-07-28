import { useMemo } from "react";
import type { Account } from "../auth";
import type { Activity } from "../model";
import type { FuellingScore, ProgressProfile } from "../progress";
import { GREETING_KEY, dayPart, longestRecent, recentSessions, shortcutsFor, weekSummary } from "../home";
import { formatClock } from "../engine";
import { loadProfile } from "../api/profileStore";
import { useI18n, type TranslationKey } from "../i18n";
import { actionText } from "../i18n/actions";
import { Stat } from "./Stat";

const BAND_KEY: Record<FuellingScore["band"], TranslationKey> = {
  "getting-started": "insights.bandGettingStarted",
  building: "insights.bandBuilding",
  solid: "insights.bandSolid",
  "dialled-in": "insights.bandDialledIn",
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
  hasSyncedData,
  onNavigate,
  onFuelSession,
}: {
  account: Account;
  progress: ProgressProfile | null;
  fuelling: FuellingScore;
  activities: Activity[];
  hasSyncedData: boolean;
  onNavigate: (tab: string) => void;
  /** Plan for a specific past session — carries its shape into the planner. */
  onFuelSession?: (a: Activity) => void;
}) {
  const { t, lang } = useI18n();
  const week = useMemo(() => weekSummary(activities), [activities]);
  const recent = useMemo(() => recentSessions(activities, 3), [activities]);
  const longest = useMemo(() => longestRecent(activities), [activities]);
  const shortcuts = useMemo(() => shortcutsFor(account.role), [account.role]);
  const bodyProfile = useMemo(() => loadProfile(), []);

  const firstName = account.name.split(/[\s@]/)[0];
  const greeting = t(GREETING_KEY[dayPart(new Date().getHours())], { name: firstName });
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
          <span className="home-readiness-value">{bodyProfile.readiness}</span>
          <span className="home-readiness-label">{t("home.readiness")}</span>
          <span className="home-readiness-src">
            {bodyProfile.useSignals ? t("home.readinessMeasured") : t("home.readinessSelf")}
          </span>
        </div>
      </section>

      {/* The one thing to do, front and centre. */}
      {next && (
        <section className="panel home-next">
          <span className="home-next-kicker">{t("home.doNext")}</span>
          <h2 className="home-next-title">{nextText!.title}</h2>
          <p className="home-next-why">{nextText!.why}</p>
          <div className="home-next-actions">
            <button type="button" className="btn btn-primary" onClick={() => onNavigate("plan")}>
              {t("home.planSession")}
            </button>
            <button type="button" className="btn btn-ghost" onClick={() => onNavigate("progress")}>
              {t("home.logSession")}
            </button>
          </div>
        </section>
      )}

      <div className="home-grid">
        <section className="panel">
          <div className="section-head">
            <h2>{t("home.thisWeek")}</h2>
            {week.hasComparison && (
              <span className={`pill${week.deltaHours >= 0 ? " pill-live" : ""}`}>
                {t("home.vsPrevious", { delta: week.deltaHours > 0 ? `+${week.deltaHours}` : String(week.deltaHours) })}
              </span>
            )}
          </div>
          {hasSyncedData ? (
            <>
              <div className="targets plain-grid">
                <Stat label={t("home.sessions")} value={String(week.sessions)} />
                <Stat label={t("home.hours")} value={String(week.hours)} />
                <Stat label={t("home.distance")} value={`${week.distanceKm} km`} />
                <Stat label={t("home.climb")} value={`${week.elevationM} m`} />
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

        <section className="panel home-score">
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
            {longest && (
              <span className="pill">
                {t("home.longestRecent")} · {formatClock(Math.round(longest.durationSec / 60))}
              </span>
            )}
          </div>
          <ul className="home-sessions">
            {recent.map((a) => (
              <li key={a.id} className="home-session">
                <span className="home-session-date">{dateFmt.format(new Date(a.startTime))}</span>
                <span className="home-session-sport">{SPORT_KEY[a.sport] ? t(SPORT_KEY[a.sport]) : a.sport}</span>
                <span className="home-session-figs">
                  {a.distanceM ? `${(a.distanceM / 1000).toFixed(1)} km` : "—"} ·{" "}
                  {formatClock(Math.round(a.durationSec / 60))}
                  {a.elevationGainM ? ` · ↑ ${a.elevationGainM} m` : ""}
                </span>
                {onFuelSession && (
                  <button type="button" className="link-btn home-session-plan" onClick={() => onFuelSession(a)}>
                    {t("home.fuelIt")}
                  </button>
                )}
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
