import type { ProgressProfile } from "../progress";
import { Stat } from "./Stat";
import { LoadProfileCard } from "./LoadProfileCard";
import { FuellingScoreCard } from "./FuellingScoreCard";
import type { FuellingScore } from "../progress";
import { useT } from "../i18n";
import { FailedBlock, LoadingBlock, type LoadState } from "./LoadState";

/**
 * Insights — how well the athlete is fuelling, what to change next, the guidance
 * behind it, and the habits that make plans better. Progress here is measured in
 * fuelling quality rather than points: no XP, no levels, no badge grid.
 */
export function ProgressView({
  profile,
  fuelling,
  hasData = true,
  dataState = "ready",
  onRetry,
  onConnect,
}: {
  profile: ProgressProfile;
  /** How well the athlete is fuelling, and what to do next. */
  fuelling?: FuellingScore;
  /** False until the athlete has synced real sessions — we never show invented numbers. */
  hasData?: boolean;
  /** Waiting, arrived, or failed — never conflated into "you have nothing". */
  dataState?: LoadState;
  onRetry?: () => void;
  onConnect?: () => void;
}) {
  const t = useT();
  const ordered = [...profile.milestones].sort((a, b) => Number(b.done) - Number(a.done));

  return (
    <main className="dash">
      {fuelling && <FuellingScoreCard score={fuelling} />}

      <section className="panel">
        <div className="section-head">
          <h2>{t("insights.yourTraining")}</h2>
          {hasData && profile.streakDays > 0 && (
            <span className="pill">{t("insights.streak", { days: profile.streakDays, best: profile.longestStreakDays })}</span>
          )}
        </div>
        {dataState === "loading" ? (
          <LoadingBlock lines={4} />
        ) : dataState === "failed" ? (
          <FailedBlock onRetry={onRetry} />
        ) : hasData ? (
          <div className="targets plain-grid">
            <Stat label={t("insights.activities")} value={String(profile.stats.activities)} />
            <Stat label={t("insights.hours")} value={`${profile.stats.hours}`} />
            <Stat label={t("insights.longSessions")} value={String(profile.stats.longSessions)} note="90 min+" />
            <Stat label={t("insights.logged")} value={String(profile.stats.loggedSessions)} note="plan learns" />
          </div>
        ) : (
          <div className="empty-state">
            <p style={{ margin: 0 }}>{t("insights.noSessions")}</p>
            {onConnect && (
              <button type="button" className="btn btn-primary mt-5" onClick={onConnect}>
                {t("insights.connectService")}
              </button>
            )}
          </div>
        )}
      </section>

      <LoadProfileCard />

      {hasData && (
      <section className="panel">
        <div className="section-head">
          <h2>{t("insights.milestones")}</h2>
          <span className="pill">
            {profile.doneCount} {t("common.of")} {profile.milestones.length}
          </span>
        </div>
        <ul className="milestones">
          {ordered.map((a) => (
            <li key={a.id} className={`milestone${a.done ? " done" : ""}`}>
              <span className="milestone-mark" aria-hidden>
                {a.done ? "✓" : "○"}
              </span>
              <span className="milestone-body">
                <span className="milestone-name">
                  {a.name} <span className="milestone-cat">{a.category}</span>
                </span>
                <span className="milestone-desc">{a.description}</span>
              </span>
            </li>
          ))}
        </ul>
      </section>
      )}
    </main>
  );
}
