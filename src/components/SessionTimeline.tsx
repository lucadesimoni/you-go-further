import { useEffect, useMemo, useRef, useState } from "react";
import { formatClock } from "../engine";
import type { FuelingCue, FuelingSchedule } from "../engine";

const KIND_LABEL: Record<FuelingCue["kind"], string> = {
  start: "Start",
  carb: "Fuel",
  drink: "Drink",
  caffeine: "Caffeine",
  finish: "Finish",
};

/** One simulated minute every SIM_TICK_MS while playing. */
const SIM_TICK_MS = 160;

/**
 * Live in-session fueling timeline. Renders the schedule and can "play" the
 * session on an accelerated clock, highlighting the cue that's due now and the
 * one coming next — the same loop a watch data-field would drive in real time.
 */
export function SessionTimeline({ schedule }: { schedule: FuelingSchedule }) {
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

  const actionable = useMemo(() => schedule.cues.filter((c) => c.kind !== "start" && c.kind !== "finish"), [schedule]);
  const nextCue = schedule.cues.find((c) => c.atMin > elapsed && c.kind !== "start");
  const dueCue = [...schedule.cues].reverse().find((c) => c.atMin <= elapsed && c.kind !== "start" && c.kind !== "finish");
  const justDue = dueCue && elapsed - dueCue.atMin <= 1;
  const pct = schedule.totalMin ? Math.min(100, (elapsed / schedule.totalMin) * 100) : 0;

  return (
    <div className="panel timeline">
      <div className="section-head">
        <h3 style={{ margin: 0, fontSize: 17 }}>In-session schedule</h3>
        <div className="tl-controls">
          <button type="button" className="btn btn-primary" onClick={() => setPlaying((p) => !p)}>
            {playing ? "Pause" : elapsed >= schedule.totalMin ? "Replay" : "Simulate"}
          </button>
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => {
              setPlaying(false);
              setElapsed(0);
            }}
          >
            Reset
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
              <strong>Now:</strong> {dueCue.label}
            </>
          ) : nextCue ? (
            <>
              <strong>Next at {formatClock(nextCue.atMin)}:</strong> {nextCue.label}
            </>
          ) : (
            <strong>Session complete — refuel now.</strong>
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
            title={`${formatClock(c.atMin)} · ${c.label}`}
          />
        ))}
      </div>

      {/* Cue list */}
      <ul className="tl-list">
        {schedule.cues.map((c, i) => {
          const done = c.atMin <= elapsed;
          return (
            <li key={i} className={`tl-row${done ? " done" : ""}${dueCue === c && justDue ? " active" : ""}`}>
              <span className={`tl-dot tl-${c.kind}`} />
              <span className="tl-time">{formatClock(c.atMin)}</span>
              <span className="tl-kind">{KIND_LABEL[c.kind]}</span>
              <span className="tl-label">
                {c.label}
                {c.sodiumMg ? <span className="tl-na"> · {c.sodiumMg} mg Na</span> : null}
              </span>
            </li>
          );
        })}
      </ul>

      <div className="tl-foot">
        <span>
          {schedule.totalCarbG} g carb · {schedule.totalFluidMl} ml planned across the session
        </span>
        <button type="button" className="btn btn-ghost" disabled title="Pushes to your watch via Garmin Connect IQ in production">
          Send to watch
        </button>
      </div>
    </div>
  );
}
