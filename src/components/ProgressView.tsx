import type { ProgressProfile } from "../progress";
import { Stat } from "./Stat";
import { LoadProfileCard } from "./LoadProfileCard";
import { FuellingScoreCard } from "./FuellingScoreCard";
import type { FuellingScore } from "../progress";
import { useT } from "../i18n";
import { FailedBlock, LoadingBlock, type LoadState } from "./LoadState";
import { TrainingMonth } from "./TrainingMonth";
import { Row } from "./Row";
import type { Activity } from "../model";
import type { SessionFeedback } from "../feedback";

/**
 * Insights — how well the athlete is fuelling, what to change next, the guidance
 * behind it, and the habits that make plans better. Progress here is measured in
 * fuelling quality rather than points: no XP, no levels, no badge grid.
 */
export function ProgressView({
  profile,
  fuelling,
  hasData = true,
  activities = [],
  feedback = [],
  dataState = "ready",
  onRetry,
  onConnect,
}: {
  profile: ProgressProfile;
  /** How well the athlete is fuelling, and what to do next. */
  fuelling?: FuellingScore;
  /** False until the athlete has synced real sessions — we never show invented numbers. */
  hasData?: boolean;
  /** The athlete's own sessions and logs, for the month grid. */
  activities?: Activity[];
  feedback?: SessionFeedback[];
  /** Waiting, arrived, or failed — never conflated into "you have nothing". */
  dataState?: LoadState;
  onRetry?: () => void;
  onConnect?: () => void;
}) {
  const t = useT();
  const done = profile.milestones.filter((m) => m.done);
  const todo = profile.milestones.filter((m) => !m.done);

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

      {/* Consistency, in the terms this app cares about: not just which days
          were trained, but which of them the planner can actually learn from. */}
      {hasData && dataState === "ready" && <TrainingMonth activities={activities} feedback={feedback} />}

      <LoadProfileCard />

      {hasData && (
      <section className="panel">
        <div className="section-head">
          <h2>{t("insights.milestones")}</h2>
          <span className="pill">
            {profile.doneCount} {t("common.of")} {profile.milestones.length}
          </span>
        </div>
        {/*
          Eleven milestones, each a title and a full sentence, made most of this
          screen a list of things the athlete has *not* done — nine hundred
          pixels of "not yet" under three ticks. What is earned stays in view;
          what is ahead is one line away, which is the right weight for a goal
          you have not reached.
        */}
        <ul className="milestones">
          {done.map((a) => (
            <Row
              key={a.id}
              as="li"
              className="milestone done"
              lead={
                <span className="row-disc row-disc-done" aria-hidden>
                  ✓
                </span>
              }
              title={
                <>
                  {a.name} <span className="milestone-cat">{a.category}</span>
                </>
              }
              meta={a.description}
            />
          ))}
        </ul>
        {todo.length > 0 && (
          <details className="panel fold milestones-todo">
            <summary className="fold-summary">{t("insights.milestonesAhead", { count: todo.length })}</summary>
            <ul className="milestones">
              {todo.map((a) => (
                <Row
                  key={a.id}
                  as="li"
                  className="milestone"
                  tone="muted"
                  lead={
                    <span className="row-disc row-disc-todo" aria-hidden>
                      ○
                    </span>
                  }
                  title={
                    <>
                      {a.name} <span className="milestone-cat">{a.category}</span>
                    </>
                  }
                  meta={a.description}
                />
              ))}
            </ul>
          </details>
        )}
      </section>
      )}
    </main>
  );
}
