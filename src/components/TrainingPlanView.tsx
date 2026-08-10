import { useEffect, useMemo, useState } from "react";
import { formatClock } from "../engine";
import type { SessionFeedback } from "../feedback";
import type { Activity } from "../model";
import {
  planLearnings,
  prepStats,
  sessionFuelling,
  type FuellingContext,
  type PlannedSession,
  type TrainingPlan,
  type TrainingWeek,
} from "../training";
import { useT, type TranslationKey } from "../i18n";
import { MoreList, ReadMore } from "./ReadMore";

/** How many weeks to show before the athlete asks for the rest. */
const PREVIEW_WEEKS = 6;

/**
 * The build to race day.
 *
 * Shown week by week rather than day by day beyond the key sessions: a
 * generated plan that dictates all seven days claims a precision it has not
 * earned, and the first thing any athlete does is move a session.
 *
 * The carbohydrate rate is deliberately on the same row as the long session
 * rather than in a separate fuelling section — that pairing is the whole
 * argument for the plan living here. "3 hours on Sunday" and "3 hours on Sunday
 * at 90 g/h with your race products" are different sessions, and only one of
 * them prepares a gut.
 */
export function TrainingPlanView({
  plan,
  fuelling,
  feedback = [],
  activities = [],
}: {
  plan: TrainingPlan;
  /** Body and conditions, so each session's dosing is this athlete's. */
  fuelling: FuellingContext;
  feedback?: SessionFeedback[];
  activities?: Activity[];
}) {
  const t = useT();
  const [expanded, setExpanded] = useState(false);
  const [openSession, setOpenSession] = useState<string | null>(null);
  const weeks = expanded ? plan.weeks : plan.weeks.slice(0, PREVIEW_WEEKS);

  /**
   * Which weeks are showing their sessions. The nearest one starts open —
   * that is the week the athlete is actually in, and the plan should answer
   * "what am I doing this week" without a tap.
   */
  const [openWeeks, setOpenWeeks] = useState<Set<string>>(
    () => new Set(plan.weeks.length ? [plan.weeks[0].startDate] : []),
  );
  // Switching races is a different build entirely, so start it the same way.
  // Keyed on the first week rather than the plan object: the plan is rebuilt on
  // every drag of the finish-time slider, and that must not slam weeks shut.
  const firstWeek = plan.weeks[0]?.startDate;
  useEffect(() => {
    setOpenWeeks(new Set(firstWeek ? [firstWeek] : []));
  }, [firstWeek]);

  const toggleWeek = (startDate: string) =>
    setOpenWeeks((prev) => {
      const next = new Set(prev);
      if (!next.delete(startDate)) next.add(startDate);
      return next;
    });

  const stats = useMemo(() => prepStats(plan), [plan]);
  const learnings = useMemo(
    () => planLearnings(plan, stats, { feedback, activities, estimatedMin: plan.peakLongMin }),
    [plan, stats, feedback, activities],
  );

  return (
    <div className="train">
      <div className="route-fuel-head">
        <h4 className="geo-title">{t("train.title")}</h4>
        <span className="pill">{t("train.peak", { hours: plan.peakHours })}</span>
      </div>
      {/* Three stacked paragraphs of preamble were pushing the plan itself
          below the fold on a phone. The first two lines say what this is; the
          rest is there for anyone who wants it. */}
      <ReadMore lines={2}>
        <p className="detail">{t("train.intro")}</p>

        {/* Where the first week's volume came from. A plan built on a guess and
            a plan built on the athlete's own six weeks are different promises. */}
        <p className="detail train-source">
          {plan.startSource === "measured"
            ? t("train.fromMeasured", { hours: plan.startHours })
            : t("train.fromAssumed", { hours: plan.startHours })}
        </p>
        {plan.tooShort && <p className="detail train-short">{t("train.tooShort")}</p>}
      </ReadMore>

      <div className="train-summary">
        <span>{t("train.longest", { time: formatClock(plan.peakLongMin) })}</span>
        <span>{t("train.rehearse", { carb: plan.raceCarbPerHourG })}</span>
      </div>

      <ol className="train-weeks">
        {weeks.map((w) => (
          <li key={w.startDate} className={`train-week train-week-${w.phase}${w.recovery ? " train-week-cut" : ""}`}>
            {/* Every week fully expanded made a fifteen-week build a page you
                scroll for a minute. The header keeps the four facts that let
                you find a week — which one, what it is for, how much, how far
                out — and the sessions open on it. This week starts open. */}
            <button
              type="button"
              className="train-week-head"
              aria-expanded={openWeeks.has(w.startDate)}
              onClick={() => toggleWeek(w.startDate)}
            >
              <span className="train-week-chevron" aria-hidden>
                {openWeeks.has(w.startDate) ? "▾" : "▸"}
              </span>
              <span className="train-week-n">{t("train.week", { n: w.index })}</span>
              <span className={`pill train-phase train-phase-${w.phase}`}>
                {t(`train.phase.${w.phase}` as TranslationKey)}
              </span>
              <span className="train-week-hours">{t("train.hoursShort", { n: w.hours })}</span>
              <span className="train-week-out">
                {w.weeksOut === 0
                  ? t("train.raceWeekLabel")
                  : t("train.weeksOut", { n: w.weeksOut, count: w.weeksOut })}
              </span>
            </button>
            {openWeeks.has(w.startDate) && (<>
            <p className="train-fuel">{t(`train.fuel.${w.fuelFocusId}` as TranslationKey)}</p>
            <ul className="train-sessions">
              {w.sessions
                .filter((s) => s.kind !== "rest")
                .map((s, i) => (
                  <li key={i} className={`train-session train-session-${s.kind}`}>
                    <button
                      type="button"
                      className="train-session-row"
                      aria-expanded={openSession === `${w.startDate}-${i}`}
                      onClick={() => setOpenSession(openSession === `${w.startDate}-${i}` ? null : `${w.startDate}-${i}`)}
                    >
                      <span className="train-session-kind">{t(`train.kind.${s.kind}` as TranslationKey)}</span>
                      <span className="train-session-dur">{formatClock(s.durationMin)}</span>
                      <span className="train-session-focus">
                        {t(`train.focus.${s.focusId}` as TranslationKey, { carb: s.carbPerHourG })}
                      </span>
                      <span className="train-session-more">{t("train.sessionFuel")}</span>
                    </button>
                    {/* Before, during and after for this exact session. Kept
                        behind a click: five sessions a week with three lines
                        each is a wall, and the athlete only needs the detail
                        for the one they are about to do. */}
                    {openSession === `${w.startDate}-${i}` && <SessionFuel session={s} ctx={fuelling} />}
                  </li>
                ))}
            </ul>
            </>)}
          </li>
        ))}
      </ol>

      <div className="train-prep">
        <h5 className="train-sub">{t("train.prep")}</h5>
        <ul className="train-prep-list">
          <li>{t("train.prepSessions", { n: stats.sessions })}</li>
          <li>{t("train.prepHours", { n: stats.hours })}</li>
          <li>{t("train.prepRehearsals", { n: stats.sessionsAtRaceRate, carb: plan.raceCarbPerHourG })}</li>
          <li>{t("train.prepCarb", { n: stats.carbToPractiseG })}</li>
          {stats.weeksToRaceRate !== undefined && (
            <li>{t("train.prepFirstRaceRate", { n: stats.weeksToRaceRate })}</li>
          )}
        </ul>
      </div>

      {/* Tailored, or honest about not being. With no logs the first item asks
          for one rather than dressing a population figure as an insight. */}
      <div className="train-learn">
        <h5 className="train-sub">{t("train.learnings")}</h5>
        <MoreList
          keep={2}
          items={learnings.map((l) => (
            <li key={l.id} className={`train-learn-${l.severity}`}>
              {t(`train.learn.${l.id}` as TranslationKey, l.values)}
            </li>
          ))}
        />
      </div>

      {plan.weeks.length > PREVIEW_WEEKS && (
        <button type="button" className="link-btn" onClick={() => setExpanded(!expanded)}>
          {expanded ? t("train.showLess") : t("train.showAll", { n: plan.weeks.length })}
        </button>
      )}

      <p className="energy-note train-disclaimer">{t("train.disclaimer")}</p>
    </div>
  );
}

/** Before, during and after for one planned session. */
function SessionFuel({ session, ctx }: { session: PlannedSession; ctx: FuellingContext }) {
  const t = useT();
  const f = useMemo(() => sessionFuelling(session, ctx), [session, ctx]);
  return (
    <dl className="train-fuel-detail">
      <dt>{t("train.pre")}</dt>
      <dd>{t("train.preValue", { carb: f.pre.carbG, fluid: f.pre.fluidMl })}</dd>
      <dt>{t("train.during")}</dt>
      <dd>
        {f.during.carbPerHourG > 0
          ? t("train.duringValue", {
              carb: f.during.carbPerHourG,
              fluid: f.during.fluidPerHourMl,
              sodium: f.during.sodiumPerLitreMg,
              feeds: f.during.feeds,
            })
          : t("train.duringNone")}
        {f.during.rehearsalRateG > 0 && <span className="pill train-rehearsal">{t("train.rehearsalTag")}</span>}
      </dd>
      <dt>{t("train.after")}</dt>
      <dd>{t("train.afterValue", { carb: f.after.carbG, protein: f.after.proteinG })}</dd>
    </dl>
  );
}

/** Exported for the panel above, which decides whether a plan is worth showing. */
export function hasUsefulPlan(plan: TrainingPlan | null): plan is TrainingPlan {
  return plan !== null && plan.weeks.length > 1;
}

export type { TrainingWeek };
