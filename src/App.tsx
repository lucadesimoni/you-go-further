import { useMemo, useState } from "react";
import { recommend } from "./engine";
import type { AthleteInput } from "./engine";
import {
  ACTIVITIES,
  CONDITIONS,
  GOALS,
  INTENSITIES,
  PHASE_LABELS,
  SWEAT_LEVELS,
} from "./options";

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

export function App() {
  const [input, setInput] = useState<AthleteInput>(DEFAULT_INPUT);
  const rec = useMemo(() => recommend(input), [input]);

  const set = <K extends keyof AthleteInput>(key: K, value: AthleteInput[K]) =>
    setInput((prev) => ({ ...prev, [key]: value }));

  const hours = Math.floor(input.durationMin / 60);
  const mins = input.durationMin % 60;
  const durationLabel = `${hours ? `${hours} h ` : ""}${mins ? `${mins} min` : hours ? "" : "0 min"}`.trim();

  return (
    <div className="page">
      <header className="hero">
        <p className="kicker">You Go Further</p>
        <h1>Swiss endurance fueling, tuned to your session</h1>
        <p className="sub">
          Tell us the goal and the session — get a before / during / after plan and matching Swiss
          products from Sponser and Winforce.
        </p>
      </header>

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
        </section>

        <section className="results" aria-live="polite">
          <div className="targets panel">
            <Stat label="Carb / hour" value={rec.target.carbPerHourG ? `${rec.target.carbPerHourG} g` : "—"} />
            <Stat label="Carb total" value={rec.target.carbTotalG ? `${rec.target.carbTotalG} g` : "—"} />
            <Stat label="Fluid / hour" value={`${rec.target.fluidPerHourMl} ml`} />
            <Stat label="Sodium / litre" value={`${rec.target.sodiumPerLitreMg} mg`} />
          </div>

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
                    </li>
                  ))}
                </ul>
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
        </section>
      </main>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="stat">
      <span className="stat-value">{value}</span>
      <span className="stat-label">{label}</span>
    </div>
  );
}
