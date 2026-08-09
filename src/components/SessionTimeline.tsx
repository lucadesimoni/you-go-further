import { useEffect, useMemo, useRef, useState } from "react";
import { formatClock } from "../engine";
import type { FuellingCue, FuellingSchedule } from "../engine";
import { useT } from "../i18n";

const KIND_LABEL: Record<FuellingCue["kind"], string> = {
  start: "Start",
  carb: "Fuel",
  drink: "Drink",
  caffeine: "Caffeine",
  finish: "Finish",
};

/** One simulated minute every SIM_TICK_MS while playing. */
const SIM_TICK_MS = 160;

/**
 * Live in-session fuelling timeline. Renders the schedule and can "play" the
 * session on an accelerated clock, highlighting the cue that's due now and the
 * one coming next — the same loop a watch data-field would drive in real time.
 */

/**
 * A cue as a sentence in the reader's language.
 *
 * The engine hands over what to take, not how to say it — an English sentence
 * it assembled cannot be translated after the fact, and choosing the athlete's
 * language was never the engine's job.
 */
function useCueText(): (cue: FuellingCue) => string {
  const t = useT();
  return (cue) =>
    cue.parts
      .map((part) => {
        switch (part.kind) {
          case "carb":
            return t("unit.carb", { n: part.grams });
          case "fluid":
            return t("cue.fluid", { n: part.millilitres });
          case "caffeine":
            return t("cue.caffeine");
          case "startTopUp":
            return t("cue.startTopUp");
          case "finishRecovery":
            return t("cue.finishRecovery");
        }
      })
      .join(" + ");
}

export function SessionTimeline({ schedule }: { schedule: FuellingSchedule }) {
  const t = useT();
  const cueText = useCueText();
  const [elapsed, setElapsed] = useState(0);
  const [playing, setPlaying] = useState(false);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  // Reset the clock whenever the plan changes.
  useEffect(() => {
    setElapsed(0);
    setPlaying(false);
  }, [schedule]);

  useEffect(() => {
    if (!playing) return;
    timer.current = setInterval(() => {
      setElapsed((e) => {
        if (e >= schedule.totalMin) {
          setPlaying(false);
          return schedule.totalMin;
        }
        return e + 1;
      });
    }, SIM_TICK_MS);
    return () => {
      if (timer.current) clearInterval(timer.current);
    };
  }, [playing, schedule.totalMin]);

  const [showAll, setShowAll] = useState(false);
  const actionable = useMemo(() => schedule.cues.filter((c) => c.kind !== "start" && c.kind !== "finish"), [schedule]);
  const nextCue = schedule.cues.find((c) => c.atMin > elapsed && c.kind !== "start");
  const dueCue = [...schedule.cues].reverse().find((c) => c.atMin <= elapsed && c.kind !== "start" && c.kind !== "finish");
  const justDue = dueCue && elapsed - dueCue.atMin <= 1;
  const pct = schedule.totalMin ? Math.min(100, (elapsed / schedule.totalMin) * 100) : 0;

  /**
   * What to show of the list: the start, the next few cues, and the finish.
   *
   * Anchored on the clock rather than on the top of the array, so simulating the
   * session walks the window forward instead of scrolling away from it.
   */
  const PREVIEW = 4;
  const visibleCues = useMemo(() => {
    const all = schedule.cues.map((cue, i) => ({ cue, i }));
    if (showAll || all.length <= PREVIEW + 2) return all;
    const upcoming = all.filter(({ cue }) => cue.atMin > elapsed || cue.kind === "start");
    const window = upcoming.slice(0, PREVIEW);
    const last = all[all.length - 1];
    // Always keep the finish in view: it is the one the athlete plans around.
    return window.some(({ i }) => i === last.i) ? window : [...window, last];
  }, [schedule.cues, showAll, elapsed]);
  const hiddenCount = schedule.cues.length - visibleCues.length;

  return (
    <div className="panel timeline">
      <div className="section-head">
        <h3 style={{ margin: 0, fontSize: 17 }}>{t("schedule.title")}</h3>
        <div className="tl-controls">
          {/* A rehearsal control, not the point of the screen: the accent
              belongs to ordering and logging, which is what the athlete is
              actually here to do. */}
          <button type="button" className="btn btn-ghost" onClick={() => setPlaying((p) => !p)}>
            {playing ? t("plan.pause") : elapsed >= schedule.totalMin ? t("plan.replay") : t("plan.simulate")}
          </button>
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => {
              setPlaying(false);
              setElapsed(0);
            }}
          >
            {t("plan.reset")}
          </button>
        </div>
      </div>

      {/* Live "now / next" banner */}
      <div className={`tl-now${justDue ? " due" : ""}`}>
        <div>
          <span className="tl-clock">{formatClock(elapsed)}</span>
          <span className="tl-total"> / {formatClock(schedule.totalMin)}</span>
        </div>
        <div className="tl-cue">
          {justDue && dueCue ? (
            <>
              <strong>{t("schedule.now")}</strong> {cueText(dueCue)}
            </>
          ) : nextCue ? (
            <>
              <strong>Next at {formatClock(nextCue.atMin)}:</strong> {cueText(nextCue)}
            </>
          ) : (
            <strong>{t("schedule.complete")}</strong>
          )}
        </div>
      </div>

      {/* Progress bar with cue markers */}
      <div className="tl-track">
        <div className="tl-progress" style={{ width: `${pct}%` }} />
        {actionable.map((c, i) => (
          <span
            key={i}
            className={`tl-marker tl-${c.kind}${c.atMin <= elapsed ? " passed" : ""}`}
            style={{ left: `${(c.atMin / schedule.totalMin) * 100}%` }}
            title={`${formatClock(c.atMin)} · ${cueText(c)}`}
          />
        ))}
      </div>

      {/*
        The cue list, minute by minute.

        A four-hour race produces two dozen rows, and all of them open at once
        made the plan look like a spreadsheet — the athlete only ever needs the
        next few. The rest is still one click away, and once the simulation is
        running the list follows the clock rather than the fold.
      */}
      <ul className="tl-list">
        {visibleCues.map(({ cue: c, i }) => {
          const done = c.atMin <= elapsed;
          return (
            <li key={i} className={`tl-row${done ? " done" : ""}${dueCue === c && justDue ? " active" : ""}`}>
              <span className={`tl-dot tl-${c.kind}`} />
              <span className="tl-time">{formatClock(c.atMin)}</span>
              <span className="tl-kind">{KIND_LABEL[c.kind]}</span>
              <span className="tl-label">
                {cueText(c)}
                {c.sodiumMg ? <span className="tl-na"> · {t("unit.sodium", { n: c.sodiumMg })}</span> : null}
              </span>
            </li>
          );
        })}
      </ul>
      {hiddenCount > 0 && (
        <button type="button" className="link-btn tl-more" onClick={() => setShowAll(true)}>
          {t("plan.showAllCues", { count: schedule.cues.length })}
        </button>
      )}

      <div className="tl-foot">
        <span>
          {t("schedule.planned", { carb: schedule.totalCarbG, fluid: schedule.totalFluidMl })}
        </span>
        <button type="button" className="btn btn-ghost" disabled title={t("schedule.sendToWatchHint")}>
          {t("schedule.sendToWatch")}
        </button>
      </div>
    </div>
  );
}
