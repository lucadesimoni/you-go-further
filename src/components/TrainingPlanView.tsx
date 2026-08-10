import { useState } from "react";
import { formatClock } from "../engine";
import type { TrainingPlan, TrainingWeek } from "../training";
import { useT, type TranslationKey } from "../i18n";

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
export function TrainingPlanView({ plan }: { plan: TrainingPlan }) {
  const t = useT();
  const [expanded, setExpanded] = useState(false);
  const weeks = expanded ? plan.weeks : plan.weeks.slice(0, PREVIEW_WEEKS);

  return (
    <div className="train">
      <div className="route-fuel-head">
        <h4 className="geo-title">{t("train.title")}</h4>
        <span className="pill">{t("train.peak", { hours: plan.peakHours })}</span>
      </div>
      <p className="detail">{t("train.intro")}</p>

      {/* Where the first week's volume came from. A plan built on a guess and a
          plan built on the athlete's own six weeks are different promises. */}
      <p className="detail train-source">
        {plan.startSource === "measured"
          ? t("train.fromMeasured", { hours: plan.startHours })
          : t("train.fromAssumed", { hours: plan.startHours })}
      </p>
      {plan.tooShort && <p className="detail train-short">{t("train.tooShort")}</p>}

      <div className="train-summary">
        <span>{t("train.longest", { time: formatClock(plan.peakLongMin) })}</span>
        <span>{t("train.rehearse", { carb: plan.raceCarbPerHourG })}</span>
      </div>

      <ol className="train-weeks">
        {weeks.map((w) => (
          <li key={w.startDate} className={`train-week train-week-${w.phase}${w.recovery ? " train-week-cut" : ""}`}>
            <div className="train-week-head">
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
            </div>
            <p className="train-fuel">{t(`train.fuel.${w.fuelFocusId}` as TranslationKey)}</p>
            <ul className="train-sessions">
              {w.sessions
                .filter((s) => s.kind !== "rest")
                .map((s, i) => (
                  <li key={i} className={`train-session train-session-${s.kind}`}>
                    <span className="train-session-kind">{t(`train.kind.${s.kind}` as TranslationKey)}</span>
                    <span className="train-session-dur">{formatClock(s.durationMin)}</span>
                    <span className="train-session-focus">
                      {t(`train.focus.${s.focusId}` as TranslationKey, { carb: s.carbPerHourG })}
                    </span>
                  </li>
                ))}
            </ul>
          </li>
        ))}
      </ol>

      {plan.weeks.length > PREVIEW_WEEKS && (
        <button type="button" className="link-btn" onClick={() => setExpanded(!expanded)}>
          {expanded ? t("train.showLess") : t("train.showAll", { n: plan.weeks.length })}
        </button>
      )}

      <p className="energy-note train-disclaimer">{t("train.disclaimer")}</p>
    </div>
  );
}

/** Exported for the panel above, which decides whether a plan is worth showing. */
export function hasUsefulPlan(plan: TrainingPlan | null): plan is TrainingPlan {
  return plan !== null && plan.weeks.length > 1;
}

export type { TrainingWeek };
