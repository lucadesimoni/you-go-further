import { useEffect, useMemo, useState } from "react";
import type { Activity as SyncedActivity } from "../model";
import type { SessionFeedback } from "../feedback";
import { formatClock } from "../engine";
import { loadProfile } from "../api/profileStore";
import {
  eventById,
  estimateFinishMin,
  planEvent,
  upcomingEvents,
  FORECAST_HORIZON_DAYS,
  type EventPlan,
  type SwissEvent,
} from "../events";
import { useI18n, type TranslationKey } from "../i18n";
import { Explain } from "./Explain";
import { TrainingPlanView, hasUsefulPlan } from "./TrainingPlanView";
import { buildTrainingPlan } from "../training";

const STORAGE_KEY = "ygf.event.v1";

/**
 * Plan the nutrition for a named race.
 *
 * The GPX importer below this answers "how do I fuel *this course*". It cannot
 * answer the question an athlete actually arrives with, which is "the
 * Jungfrau-Marathon is in nine weeks — what do I do about it?" That question
 * has a date in it, and almost everything useful follows from the date:
 *
 * - what to practise now versus what to leave alone,
 * - when carbohydrate loading opens (36–48 hours, not the whole week),
 * - and, once the race is inside model range, the real forecast for the hours
 *   the athlete will be out there rather than a September average.
 *
 * The chosen race is remembered, because it is the same race every time until
 * it is run.
 */
export function EventPlanner({
  activities = [],
  feedback = [],
  onPlan,
}: {
  /** The athlete's synced sessions, for the readiness check. */
  activities?: SyncedActivity[];
  /** Their logged sessions, so the plan's learnings are actually theirs. */
  feedback?: SessionFeedback[];
  /**
   * Carry this race into the session planner. The whole session shape goes,
   * not just the activity: a race is planned at race intensity, and sending
   * only the duration left the planner computing a *different* carbohydrate
   * target from the one shown here two panels above.
   */
  onPlan?: (prefill: Pick<EventPlan["session"], "goal" | "activity" | "durationMin" | "intensity" | "conditions">) => void;
}) {
  const { t, lang } = useI18n();
  const [eventId, setEventId] = useState<string>(() => {
    try {
      return typeof localStorage !== "undefined" ? (localStorage.getItem(STORAGE_KEY) ?? "") : "";
    } catch {
      return "";
    }
  });
  const [finishMin, setFinishMin] = useState<number | null>(null);
  const [plan, setPlan] = useState<EventPlan | null>(null);
  /**
   * Race day and the build are two different questions, and stacking them made
   * one panel four screens deep. An athlete nine weeks out wants the plan; one
   * on the Thursday before wants what to carry.
   */
  const [view, setView] = useState<"raceDay" | "training">("raceDay");

  const upcoming = useMemo(() => upcomingEvents(), []);
  const event: SwissEvent | undefined = eventId ? eventById(eventId) : undefined;

  // The slider starts from the course's own estimate and then belongs to the
  // athlete: their number is better than ours and everything below follows it.
  const effectiveMin = finishMin ?? (event ? estimateFinishMin(event) : 0);

  useEffect(() => {
    if (!event) {
      setPlan(null);
      return;
    }
    let live = true;
    const profile = loadProfile();
    void planEvent({
      event,
      bodyWeightKg: profile.bodyWeightKg,
      sweatLevel: profile.sweatLevel,
      estimatedMin: effectiveMin,
      activities,
    }).then((p) => {
      if (live) setPlan(p);
    });
    return () => {
      live = false;
    };
  }, [event, effectiveMin, activities]);

  const choose = (id: string) => {
    setEventId(id);
    setFinishMin(null);
    try {
      if (typeof localStorage !== "undefined") {
        if (id) localStorage.setItem(STORAGE_KEY, id);
        else localStorage.removeItem(STORAGE_KEY);
      }
    } catch {
      /* the choice just won't persist */
    }
  };

  const dateLabel = (e: SwissEvent) =>
    new Date(`${e.date}T12:00:00Z`).toLocaleDateString(lang, { day: "numeric", month: "short" });

  return (
    <section className="panel event">
      <div className="section-head">
        <h2>{t("event.title")}</h2>
        {event && (
          <button type="button" className="link-btn" onClick={() => choose("")}>
            {t("event.change")}
          </button>
        )}
      </div>

      {!event && (
        <>
          <p className="detail">{t("event.intro")}</p>
          <div className="field event-pick">
            <label htmlFor="event-select">{t("event.choose")}</label>
            <select id="event-select" value="" onChange={(e) => choose(e.target.value)}>
              <option value="">{t("event.none")}</option>
              {upcoming.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.name} — {dateLabel(e)}
                </option>
              ))}
            </select>
          </div>
        </>
      )}

      {event && plan && (
        <>
          <div className="event-head">
            <div>
              <h3 className="event-name">{event.name}</h3>
              <p className="event-figs">
                {t("event.course", { distance: event.distanceKm, ascent: event.ascentM })}
                {event.maxAltM ? ` · ${t("event.highPoint", { alt: event.maxAltM })}` : ""}
                {event.cutoffMin ? ` · ${t("event.cutoff", { time: formatClock(event.cutoffMin) })}` : ""}
              </p>
            </div>
            <div className="event-count">
              {/* On race day the phase and the countdown are the same word, and
                  on a finished race they say the same thing twice. In both the
                  sentence below carries it, so the pill stands down. */}
              {plan.countdown.phase !== "raceDay" && plan.countdown.phase !== "done" && (
                <span className={`pill event-phase event-phase-${plan.countdown.phase}`}>
                  {t(`event.phase.${plan.countdown.phase}` as TranslationKey)}
                </span>
              )}
              <span className="event-days">
                {plan.countdown.phase === "done"
                  ? t("event.past")
                  : plan.countdown.isToday
                    ? t("event.today")
                    : t("event.daysToGo", { days: plan.countdown.daysOut, count: plan.countdown.daysOut })}
              </span>
            </div>
          </div>

          {/* Where the date came from, said plainly. The list is compiled from
              published calendars and races move; an athlete who tapers for the
              wrong Saturday has been failed by a number we presented as fact. */}
          <p className="detail event-provenance">
            {event.dateApproximate && t("event.dateApproximate")}{" "}
            {event.organiserUrl && (
              <a href={event.organiserUrl} target="_blank" rel="noreferrer noopener">
                {t("event.organiser")}
              </a>
            )}
          </p>

          <div className="field event-finish">
            <label htmlFor="event-finish">
              {t("event.finishTime")} <span className="value">{formatClock(effectiveMin)}</span>
            </label>
            <input
              id="event-finish"
              type="range"
              min={30}
              max={1800}
              step={5}
              value={effectiveMin}
              onChange={(e) => setFinishMin(Number(e.target.value))}
            />
            {plan.estimateSource === "derived" && <p className="detail">{t("event.finishDerived")}</p>}
          </div>

          {view === "raceDay" && (<>
          <nav className="event-views" aria-label={t("event.title")}>
            {(["raceDay", "training"] as const).map((v) => (
              <button
                key={v}
                type="button"
                className={view === v ? "event-view active" : "event-view"}
                aria-pressed={view === v}
                onClick={() => setView(v)}
              >
                {t(v === "raceDay" ? "event.tabRaceDay" : "event.tabTraining")}
              </button>
            ))}
          </nav>

          <div className="event-cols">
            <div className="geo-block">
              <div className="geo-head">
                <span className="geo-title">{t("event.raceDayWeather")}</span>
                <span
                  className={`geo-src geo-src-${plan.weather.forecast ? "swisstopo" : "estimated"}`}
                  title={plan.weather.sourceLabel}
                >
                  {plan.weather.forecast ? t("event.forecastBadge") : t("event.estimateBadge")}
                </span>
              </div>
              <div className="geo-stats">
                <div className="stat">
                  <span className="stat-value">{plan.weather.temperatureC}°C</span>
                  <span className="stat-label">{t("event.peaks", { temp: plan.weather.peakTemperatureC })}</span>
                </div>
                <div className="stat">
                  <span className="stat-value">{plan.weather.humidityPct}%</span>
                  <span className="stat-label">{t("route.humidity")}</span>
                </div>
                <div className="stat">
                  <span className="stat-value">{plan.weather.windKmh} km/h</span>
                  <span className="stat-label">{t("route.wind")}</span>
                </div>
              </div>
              <p className="geo-source-note">
                {plan.weather.forecast
                  ? t("event.forecastWindow", { from: plan.weather.window[0], to: plan.weather.window[1] })
                  : plan.weather.estimateReason === "unreachable"
                    ? t("event.forecastUnreachable")
                    : t("event.forecastPending", {
                        days: Math.max(1, plan.countdown.daysOut - FORECAST_HORIZON_DAYS),
                      })}
              </p>
            </div>

            <div className="geo-block">
              <div className="geo-head">
                <span className="geo-title">{t("event.targets")}</span>
              </div>
              <div className="geo-stats">
                <div className="stat">
                  <span className="stat-value">{plan.target.carbPerHourG} g/h</span>
                  <span className="stat-label">{t("plan.carbPerHour")}</span>
                </div>
                <div className="stat">
                  <span className="stat-value">{plan.target.fluidPerHourMl} ml/h</span>
                  <span className="stat-label">{t("plan.fluidPerHour")}</span>
                </div>
                <div className="stat">
                  <span className="stat-value">{plan.target.carbTotalG} g</span>
                  <span className="stat-label">{t("event.totalCarb")}</span>
                </div>
              </div>
              {plan.readiness && (
                <p className="geo-source-note">
                  {t("event.readiness")}: {formatClock(plan.readiness.longestMin)} —{" "}
                  {t("event.readinessRatio", { pct: Math.round(plan.readiness.ratio * 100) })}
                </p>
              )}
            </div>
          </div>

          <div className="event-advice">
            <h4 className="geo-title">{t("event.thisWeek")}</h4>
            <ul>
              {plan.advice.map((a) => (
                <li key={a.id} className={`event-advice-${a.severity}`}>
                  {t(`event.advice.${a.id}` as TranslationKey, adviceVars(a.values))}
                </li>
              ))}
            </ul>
          </div>


          {plan.legs.length > 0 ? (
            <div className="event-legs">
              <h4 className="geo-title">{t("event.legs")}</h4>
              <p className="detail">{t("event.legsIntro")}</p>
              <table>
                <thead>
                  <tr>
                    <th scope="col">{t("event.leg")}</th>
                    <th scope="col">{t("plan.duration")}</th>
                    <th scope="col">{t("plan.carbTotal")}</th>
                    <th scope="col">{t("plan.fluidPerHour")}</th>
                  </tr>
                </thead>
                <tbody>
                  {plan.legs.map((leg) => (
                    <tr key={`${leg.fromKm}-${leg.toKm}`} className={leg.mustCarry ? "event-leg-carry" : undefined}>
                      <th scope="row">
                        {leg.fromName ?? t("event.legStart")} → {leg.toName ?? t("event.legFinish")}
                        <span className="event-leg-km">
                          {leg.fromKm}–{leg.toKm} km ·{" "}
                          {/* Said in words, not only by the red edge: which legs
                              you have to be self-sufficient on is the single
                              most useful thing in this table, and a colour
                              alone does not carry it to everyone. */}
                          {leg.mustCarry ? t("event.legCarry") : t("event.legAvailable")}
                        </span>
                      </th>
                      <td>{formatClock(leg.minutes)}</td>
                      <td>{leg.carbG} g</td>
                      <td>{leg.fluidMl} ml</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <Explain>
                <p>{t("event.legsIntro")}</p>
              </Explain>
            </div>
          ) : (
            <p className="detail event-nolegs">{t("event.noLegs")}</p>
          )}
          </>)}

          {view === "training" && (() => {
            const training = buildTrainingPlan({
              event,
              estimatedMin: plan.estimatedMin,
              raceCarbPerHourG: plan.target.carbPerHourG,
              activities,
            });
            return hasUsefulPlan(training) ? (
              <TrainingPlanView
                plan={training}
                fuelling={{
                  event,
                  bodyWeightKg: loadProfile().bodyWeightKg,
                  sweatLevel: loadProfile().sweatLevel,
                  caffeineOk: loadProfile().caffeineOk,
                  conditions: plan.weather.peakConditions,
                  feedback,
                }}
                feedback={feedback}
                activities={activities}
              />
            ) : null;
          })()}

          {onPlan && (
            <button
              type="button"
              className="btn btn-primary geo-plan"
              onClick={() =>
                onPlan({
                  goal: plan.session.goal,
                  activity: plan.session.activity,
                  durationMin: plan.estimatedMin,
                  intensity: plan.session.intensity,
                  conditions: plan.session.conditions,
                })
              }
            >
              {t("event.planThis")}
            </button>
          )}
        </>
      )}
    </section>
  );
}

/**
 * Map an advice item's raw numbers onto the placeholders its sentence uses.
 *
 * Durations become clock times here rather than in the engine: `{longest}`
 * reading "1:30" is what an athlete recognises, and "90" is what a spreadsheet
 * does. The engine stays in minutes because minutes are what arithmetic needs.
 */
function adviceVars(values: Record<string, number>): Record<string, string | number> {
  const out: Record<string, string | number> = { ...values };
  if (typeof values.gramsPerDay === "number") out.grams = values.gramsPerDay;
  if (typeof values.carbG === "number") out.carb = values.carbG;
  if (typeof values.peakC === "number") out.peak = values.peakC;
  if (typeof values.fluidMl === "number") out.fluid = values.fluidMl;
  if (typeof values.sodiumMg === "number") out.sodium = values.sodiumMg;
  if (typeof values.tempC === "number") out.temp = values.tempC;
  if (typeof values.altM === "number") out.alt = values.altM;
  if (typeof values.cutoffMin === "number") out.cutoff = formatClock(values.cutoffMin);
  if (typeof values.estimatedMin === "number") out.estimated = formatClock(values.estimatedMin);
  if (typeof values.longestMin === "number") out.longest = formatClock(values.longestMin);
  return out;
}
