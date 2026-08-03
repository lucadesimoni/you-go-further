import { useEffect, useMemo, useState } from "react";
import type { LoadProfile } from "../analysis";
import { api, isApiConfigured } from "../api/client";
import { Explain } from "./Explain";
import { Stat } from "./Stat";
import { useT } from "../i18n";

/**
 * Fitness, fatigue and form — the shape of the athlete's training, and what it
 * means for what they should eat.
 *
 * The platform already showed acute:chronic ratio, which is one number and a
 * blunt one. This is the standard picture around it, computed server-side from
 * the same per-session load so the two can never disagree. It earns its place on
 * a *nutrition* screen because each state changes the plan: deep fatigue makes
 * recovery carbohydrate and protein urgent, a fast ramp moves the weekly
 * carbohydrate floor, and good form is the week to rehearse race fuelling.
 */
type LoadResponse = LoadProfile & { flags: { id: string; severity: string; text: string }[] };

const TREND_KEY = {
  building: "load.building",
  steady: "load.steady",
  tapering: "load.tapering",
  detraining: "load.detraining",
} as const;

export function LoadProfileCard() {
  const t = useT();
  const [data, setData] = useState<LoadResponse | null>(null);

  useEffect(() => {
    if (!isApiConfigured()) return;
    let alive = true;
    api
      .load()
      .then((r) => alive && setData(r as LoadResponse))
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, []);

  // The last 8 weeks of the fitness curve, enough to see a build or a taper.
  const spark = useMemo(() => {
    if (!data?.series.length) return null;
    const points = data.series.slice(-56);
    if (points.length < 4) return null;
    const max = Math.max(...points.map((p) => Math.max(p.fitness, p.fatigue)), 1);
    const x = (i: number) => (i / (points.length - 1)) * 100;
    const y = (v: number) => 30 - (v / max) * 28;
    return {
      fitness: points.map((p, i) => `${x(i).toFixed(1)},${y(p.fitness).toFixed(1)}`).join(" "),
      fatigue: points.map((p, i) => `${x(i).toFixed(1)},${y(p.fatigue).toFixed(1)}`).join(" "),
      days: points.length,
    };
  }, [data]);

  // Nothing to say until there is enough history for the averages to mean
  // something — a 42-day average over ten days of data is mostly warm-up.
  if (!data || !data.reliable) return null;

  /** The flags are already computed server-side — the figures just read them. */
  const flagged = (id: string) => data.flags.some((f) => f.id === id);

  return (
    <section className="panel load">
      <div className="section-head">
        <h2>{t("load.title")}</h2>
        <span className="pill">{t(TREND_KEY[data.trend])}</span>
      </div>

      <div className="targets plain-grid">
        <Stat label={t("load.fitness")} value={String(Math.round(data.fitness))} note={t("load.fitnessNote")} />
        <Stat
          label={t("load.fatigue")}
          value={String(Math.round(data.fatigue))}
          note={t("load.fatigueNote")}
          tone={flagged("deepFatigue") ? "watch" : "muted"}
        />
        <Stat
          label={t("load.form")}
          value={`${data.form > 0 ? "+" : ""}${Math.round(data.form)}`}
          note={t("load.formNote")}
          tone={flagged("wellRested") ? "good" : "muted"}
        />
        {/* The panel already says in words that a fast ramp is where injuries
            cluster; the number it is talking about should not read as neutral. */}
        <Stat
          label={t("load.ramp")}
          value={`${data.rampPct > 0 ? "+" : ""}${data.rampPct}%`}
          note={t("load.rampNote")}
          tone={flagged("rampTooFast") ? "watch" : "muted"}
        />
      </div>

      {spark && (
        <svg className="load-spark" viewBox="0 0 100 32" preserveAspectRatio="none" role="img" aria-label={t("load.chartLabel", { days: spark.days })}>
          <polyline className="load-line-fitness" points={spark.fitness} />
          <polyline className="load-line-fatigue" points={spark.fatigue} />
        </svg>
      )}
      <div className="load-legend">
        <span className="lg lg-fitness">{t("load.fitness")}</span>
        <span className="lg lg-fatigue">{t("load.fatigue")}</span>
      </div>

      {data.flags.length > 0 && (
        <ul className="load-flags">
          {data.flags.map((f) => (
            <li key={f.id} className={`load-flag load-flag-${f.severity}`}>
              {f.text}
            </li>
          ))}
        </ul>
      )}

      <Explain>
        <p>{t("load.explain")}</p>
        <p>{t("load.explainMonotony", { monotony: data.monotony, days: data.activeDays })}</p>
      </Explain>
    </section>
  );
}
