import { useEffect, useMemo, useState } from "react";
import { buildSchedule, recommend, CATALOG } from "../engine";
import type { AthleteInput, Product } from "../engine";
import { estimateSweatRateMlPerH } from "../analysis";
import { deriveAdaptation, toAdaptation, type EnergyRating, type GiRating, type SessionFeedback } from "../feedback";
import type { Role } from "../auth";
import { addFeedback, clearFeedback, feedbackPersistence, loadFeedback } from "../api/feedbackStore";
import { loadCatalog } from "../api/productLibrary";
import { ACTIVITIES, CONDITIONS, GOALS, INTENSITIES, PHASE_LABELS, SWEAT_LEVELS } from "../options";
import { Stat } from "./Stat";
import { SessionTimeline } from "./SessionTimeline";
import { CartPanel } from "./CartPanel";
import { FeedbackPanel } from "./FeedbackPanel";

const DEFAULT_INPUT: AthleteInput = {
  goal: "endurance-performance",
  activity: "running",
  durationMin: 90,
  intensity: "moderate",
  bodyWeightKg: 70,
  conditions: "temperate",
  sweatLevel: "average",
  caffeineOk: false,
};

/** Standalone session fuel planner (the Base-tier feature). */
export function Planner({ initial, role = "athlete" }: { initial?: Partial<AthleteInput>; role?: Role }) {
  const [input, setInput] = useState<AthleteInput>({ ...DEFAULT_INPUT, ...initial });

  // Optional measured body signals — the "optimized for your body" layer.
  const [useSignals, setUseSignals] = useState(false);
  const [sweatRate, setSweatRate] = useState(1000);
  const [sweatSodium, setSweatSodium] = useState(800);
  const [readiness, setReadiness] = useState(65);

  // Feedback loop — learned adaptation, persisted server-side (or localStorage).
  const [feedbacks, setFeedbacks] = useState<SessionFeedback[]>([]);
  const insight = useMemo(() => deriveAdaptation(feedbacks), [feedbacks]);

  // Product library — built-in Swiss catalog plus any admin/house products.
  const [catalog, setCatalog] = useState<Product[]>(CATALOG);

  useEffect(() => {
    let cancelled = false;
    loadFeedback(role)
      .then((list) => !cancelled && setFeedbacks(list))
      .catch(() => !cancelled && setFeedbacks([]));
    loadCatalog()
      .then((list) => !cancelled && list.length && setCatalog(list))
      .catch(() => {
        /* keep built-in catalog on failure */
      });
    return () => {
      cancelled = true;
    };
  }, [role]);

  const effectiveInput = useMemo<AthleteInput>(
    () => ({
      ...input,
      physiology: useSignals
        ? { sweatRateMlPerH: sweatRate, sweatSodiumMgPerL: sweatSodium, readiness }
        : undefined,
      adaptation: insight.samples > 0 ? toAdaptation(insight) : undefined,
    }),
    [input, useSignals, sweatRate, sweatSodium, readiness, insight],
  );
  const rec = useMemo(() => recommend(effectiveInput, catalog), [effectiveInput, catalog]);
  const schedule = useMemo(() => buildSchedule(effectiveInput), [effectiveInput]);

  const logFeedback = (gi: GiRating, energy: EnergyRating) => {
    void addFeedback(role, {
      gi,
      energy,
      durationMin: input.durationMin,
      plannedCarbPerHourG: rec.target.carbPerHourG,
    }).then(setFeedbacks);
  };
  const resetFeedback = () => void clearFeedback(role).then(setFeedbacks);

  const set = <K extends keyof AthleteInput>(key: K, value: AthleteInput[K]) =>
    setInput((prev) => ({ ...prev, [key]: value }));

  const seedSweat = () => setSweatRate(estimateSweatRateMlPerH(input.bodyWeightKg, input.intensity, input.conditions));

  const hours = Math.floor(input.durationMin / 60);
  const mins = input.durationMin % 60;
  const durationLabel = `${hours ? `${hours} h ` : ""}${mins ? `${mins} min` : hours ? "" : "0 min"}`.trim();

  return (
    <main className="layout">
      <section className="panel form" aria-label="Session details">
        <div className="field">
          <label htmlFor="goal">Goal</label>
          <select id="goal" value={input.goal} onChange={(e) => set("goal", e.target.value as AthleteInput["goal"])}>
            {GOALS.map((g) => (
              <option key={g.value} value={g.value}>
                {g.label} — {g.blurb}
              </option>
            ))}
          </select>
        </div>

        <div className="field">
          <label htmlFor="activity">Activity</label>
          <select
            id="activity"
            value={input.activity}
            onChange={(e) => set("activity", e.target.value as AthleteInput["activity"])}
          >
            {ACTIVITIES.map((a) => (
              <option key={a.value} value={a.value}>
                {a.label}
              </option>
            ))}
          </select>
        </div>

        <div className="field">
          <label htmlFor="duration">
            Duration <span className="value">{durationLabel}</span>
          </label>
          <input
            id="duration"
            type="range"
            min={20}
            max={360}
            step={5}
            value={input.durationMin}
            onChange={(e) => set("durationMin", Number(e.target.value))}
          />
        </div>

        <div className="field">
          <span className="group-label">Intensity</span>
          <div className="segmented" role="group" aria-label="Intensity">
            {INTENSITIES.map((i) => (
              <button
                key={i.value}
                type="button"
                className={input.intensity === i.value ? "seg active" : "seg"}
                onClick={() => set("intensity", i.value)}
              >
                {i.label}
              </button>
            ))}
          </div>
        </div>

        <div className="field">
          <label htmlFor="weight">
            Body weight <span className="value">{input.bodyWeightKg} kg</span>
          </label>
          <input
            id="weight"
            type="range"
            min={40}
            max={120}
            step={1}
            value={input.bodyWeightKg}
            onChange={(e) => set("bodyWeightKg", Number(e.target.value))}
          />
        </div>

        <div className="field-row">
          <div className="field">
            <label htmlFor="conditions">Conditions</label>
            <select
              id="conditions"
              value={input.conditions}
              onChange={(e) => set("conditions", e.target.value as AthleteInput["conditions"])}
            >
              {CONDITIONS.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="sweat">Sweat level</label>
            <select
              id="sweat"
              value={input.sweatLevel}
              onChange={(e) => set("sweatLevel", e.target.value as AthleteInput["sweatLevel"])}
            >
              {SWEAT_LEVELS.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        <label className="checkbox">
          <input
            type="checkbox"
            checked={Boolean(input.caffeineOk)}
            onChange={(e) => set("caffeineOk", e.target.checked)}
          />
          <span>Suggest caffeine for long / hard efforts</span>
        </label>

        <div className="signals">
          <label className="checkbox">
            <input
              type="checkbox"
              checked={useSignals}
              onChange={(e) => {
                if (e.target.checked && sweatRate === 1000) seedSweat();
                setUseSignals(e.target.checked);
              }}
            />
            <span>Personalize with my body signals</span>
          </label>
          {useSignals && (
            <div className="signals-body">
              <div className="field">
                <label htmlFor="sweat-rate">
                  Sweat rate <span className="value">{sweatRate} ml/h</span>
                </label>
                <input id="sweat-rate" type="range" min={400} max={2200} step={50} value={sweatRate} onChange={(e) => setSweatRate(Number(e.target.value))} />
              </div>
              <div className="field">
                <label htmlFor="sweat-na">
                  Sweat sodium <span className="value">{sweatSodium} mg/L</span>
                </label>
                <input id="sweat-na" type="range" min={300} max={1500} step={50} value={sweatSodium} onChange={(e) => setSweatSodium(Number(e.target.value))} />
              </div>
              <div className="field">
                <label htmlFor="readiness">
                  Training readiness <span className="value">{readiness}/100</span>
                </label>
                <input id="readiness" type="range" min={10} max={100} step={1} value={readiness} onChange={(e) => setReadiness(Number(e.target.value))} />
              </div>
              <p className="detail" style={{ margin: 0 }}>
                From a sweat test or your watch. Values here override the population estimates below.
              </p>
            </div>
          )}
        </div>
      </section>

      <section className="results" aria-live="polite">
        <div className="targets panel">
          <Stat label="Carb / hour" value={rec.target.carbPerHourG ? `${rec.target.carbPerHourG} g` : "—"} />
          <Stat label="Carb total" value={rec.target.carbTotalG ? `${rec.target.carbTotalG} g` : "—"} />
          <Stat
            label="Fluid / hour"
            value={`${rec.target.fluidPerHourMl} ml`}
            note={rec.target.hydrationSource === "measured" ? "measured" : undefined}
          />
          <Stat
            label="Sodium / litre"
            value={`${rec.target.sodiumPerLitreMg} mg`}
            note={rec.target.sodiumSource === "measured" ? "measured" : undefined}
          />
        </div>

        <SessionTimeline schedule={schedule} />

        {rec.phases.map((phase) => (
          <div className="panel phase" key={phase.phase}>
            <div className="phase-head">
              <span className={`badge badge-${phase.phase}`}>{PHASE_LABELS[phase.phase]}</span>
              <h3>{phase.headline}</h3>
            </div>
            <p className="detail">{phase.detail}</p>
            {phase.products.length > 0 && (
              <ul className="products">
                {phase.products.map((p) => (
                  <li key={p.id} className="product">
                    <div className="product-top">
                      <span className="product-name">
                        <strong>{p.brand}</strong> {p.name}
                        {p.custom && <span className="tag tag-house">house</span>}
                      </span>
                      <span className="serving">{p.servingLabel}</span>
                    </div>
                    <div className="tags">
                      {p.carbsG > 1 && <span className="tag">{p.carbsG} g carb</span>}
                      {p.sodiumMg > 0 && <span className="tag">{p.sodiumMg} mg Na</span>}
                      {p.proteinG ? <span className="tag">{p.proteinG} g protein</span> : null}
                      {p.caffeineMg ? <span className="tag caf">{p.caffeineMg} mg caffeine</span> : null}
                      {p.multiTransportable && <span className="tag">2:1 carbs</span>}
                    </div>
                    {p.notes && <p className="product-note">{p.notes}</p>}
                    {p.shopUrl && (
                      <a className="product-shop" href={p.shopUrl} target="_blank" rel="noreferrer noopener">
                        Buy at {p.brand} ↗
                      </a>
                    )}
                  </li>
                ))}
              </ul>
            )}
            {phase.rationale.length > 0 && (
              <details className="why">
                <summary>Why these — ingredients &amp; combo</summary>
                <ul className="why-list">
                  {phase.rationale.map((r, i) => (
                    <li key={i}>{r}</li>
                  ))}
                </ul>
              </details>
            )}
          </div>
        ))}

        <div className="panel notes">
          <h4>Notes</h4>
          <ul>
            {rec.notes.map((n, i) => (
              <li key={i}>{n}</li>
            ))}
          </ul>
        </div>

        <CartPanel rec={rec} />

        <FeedbackPanel
          insight={insight}
          feedbacks={feedbacks}
          onLog={logFeedback}
          onReset={resetFeedback}
          persistence={feedbackPersistence.mode()}
        />
      </section>
    </main>
  );
}
