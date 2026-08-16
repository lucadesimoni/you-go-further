import { useMemo } from "react";
import type { Activity } from "../model";
import type { SessionFeedback } from "../feedback";
import { monthDays } from "./trainingMonthDays";
import { useI18n, useT } from "../i18n";

/**
 * The month at a glance — and, more to the point, which of it we know about.
 *
 * A dot grid of the last five weeks. The borrowed form is a training calendar;
 * what it carries here is this platform's own question. Every endurance app can
 * tell an athlete they ran on Tuesday. Only this one is trying to learn how the
 * fuelling went, and it can only learn from sessions that were logged — so the
 * grid distinguishes three states rather than two:
 *
 *   · nothing        — a rest day, or a day we have no session for
 *   ○ trained        — a session arrived from a connected service
 *   ● logged         — and the athlete said how the fuelling felt
 *
 * The gap between the rings and the filled dots is the gap between "we have
 * your training" and "we can improve your fuelling", which is the one thing
 * this app most needs an athlete to understand. It is drawn, not argued.
 */
export function TrainingMonth({
  activities,
  feedback = [],
  today = new Date(),
}: {
  activities: Activity[];
  feedback?: SessionFeedback[];
  /** Injectable so the grid can be tested without waiting for a Tuesday. */
  today?: Date;
}) {
  const t = useT();
  const { lang } = useI18n();

  const { days, weekdayLabels, monthLabel } = useMemo(() => {
    const list = monthDays(activities, feedback, today);
    // The first row is a whole week, so its seven dates are the column headings.
    const firstWeek = list.slice(0, 7).map((d) => d.date);

    const locale = lang === "de" ? "de-CH" : lang === "fr" ? "fr-CH" : lang === "it" ? "it-CH" : "en-GB";
    // Weekday initials from the locale, not from a hard-coded list: Monday is
    // "M" in English, "M" in Italian and "M" in German — and Tuesday is not.
    const narrow = new Intl.DateTimeFormat(locale, { weekday: "narrow" });
    const labels = firstWeek.map((d) => narrow.format(d));
    return {
      days: list,
      weekdayLabels: labels,
      // Named for the month the grid ends in, which is the one it is mostly about.
      monthLabel: new Intl.DateTimeFormat(locale, { month: "long" }).format(today),
    };
  }, [activities, feedback, today, lang]);

  const logged = days.filter((d) => d.state === "logged").length;
  const trained = days.filter((d) => d.state !== "none").length;
  const dateFmt = useMemo(
    () => new Intl.DateTimeFormat(lang === "de" ? "de-CH" : "en-GB", { day: "numeric", month: "short" }),
    [lang],
  );

  return (
    <section className="panel month">
      <div className="section-head">
        <h2>{monthLabel}</h2>
        <span className="pill">{t("month.count", { logged, trained })}</span>
      </div>

      <div className="month-grid" role="img" aria-label={t("month.aria", { logged, trained })}>
        {weekdayLabels.map((label, i) => (
          <span key={`h${i}`} className="month-weekday" aria-hidden>
            {label}
          </span>
        ))}
        {days.map(({ date, state, future }) => (
          <span
            key={date.toISOString()}
            className={`month-dot month-dot-${state}${future ? " month-dot-future" : ""}`}
            /* A tooltip, so the grid is readable rather than decorative. */
            title={`${dateFmt.format(date)} · ${t(
              state === "logged" ? "month.dayLogged" : state === "trained" ? "month.dayTrained" : "month.dayNone",
            )}`}
          />
        ))}
      </div>

      <p className="month-legend">
        <span className="month-key">
          <span className="month-dot month-dot-trained" aria-hidden /> {t("month.keyTrained")}
        </span>
        <span className="month-key">
          <span className="month-dot month-dot-logged" aria-hidden /> {t("month.keyLogged")}
        </span>
      </p>
      {/* Said once, plainly, and only when it is true. */}
      {trained > logged && <p className="detail">{t("month.whyLog")}</p>}
    </section>
  );
}
