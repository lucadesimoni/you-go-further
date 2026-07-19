import { useState } from "react";
import type { AdaptationInsight, EnergyRating, GiRating, SessionFeedback } from "../feedback";

const GI_OPTS: { value: GiRating; label: string }[] = [
  { value: "none", label: "None" },
  { value: "mild", label: "Mild" },
  { value: "severe", label: "Severe" },
];
const ENERGY_OPTS: { value: EnergyRating; label: string }[] = [
  { value: "bonked", label: "Bonked" },
  { value: "faded", label: "Faded" },
  { value: "steady", label: "Steady" },
  { value: "strong", label: "Strong" },
];

const CONF_LABEL: Record<AdaptationInsight["confidence"], string> = {
  none: "no data yet",
  low: "low confidence",
  medium: "building confidence",
  high: "high confidence",
};

/**
 * "Log & learn" — the feedback loop. The athlete records how a session went; the
 * insight (carb ceiling / bias) updates live and feeds back into the plan above.
 */
export function FeedbackPanel({
  insight,
  feedbacks,
  onLog,
  onReset,
  persistence,
}: {
  insight: AdaptationInsight;
  feedbacks: SessionFeedback[];
  onLog: (gi: GiRating, energy: EnergyRating) => void;
  onReset: () => void;
  persistence: "server" | "local";
}) {
  const [gi, setGi] = useState<GiRating>("none");
  const [energy, setEnergy] = useState<EnergyRating>("steady");
  const [justLogged, setJustLogged] = useState(false);

  const log = () => {
    onLog(gi, energy);
    setJustLogged(true);
    setTimeout(() => setJustLogged(false), 1600);
  };

  return (
    <div className="panel feedback">
      <div className="section-head">
        <h3 style={{ margin: 0, fontSize: 17 }}>Log &amp; learn</h3>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span className={`pill${persistence === "server" ? " pill-live" : ""}`}>
            {persistence === "server" ? "● synced to account" : "saved on this device"}
          </span>
          {feedbacks.length > 0 && (
            <button type="button" className="btn btn-ghost" onClick={onReset}>
              Clear
            </button>
          )}
        </div>
      </div>
      <p className="detail">
        After a session, tell us how it went. We learn your gut tolerance and energy needs and tune
        the plan above — it gets more <em>you</em> every time.
      </p>

      <div className="fb-row">
        <div className="field">
          <span className="group-label">Gut / GI</span>
          <div className="segmented" style={{ gridTemplateColumns: "repeat(3,1fr)" }}>
            {GI_OPTS.map((o) => (
              <button key={o.value} type="button" className={gi === o.value ? "seg active" : "seg"} onClick={() => setGi(o.value)}>
                {o.label}
              </button>
            ))}
          </div>
        </div>
        <div className="field">
          <span className="group-label">Energy</span>
          <div className="segmented">
            {ENERGY_OPTS.map((o) => (
              <button key={o.value} type="button" className={energy === o.value ? "seg active" : "seg"} onClick={() => setEnergy(o.value)}>
                {o.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <button type="button" className={`btn btn-primary${justLogged ? " done" : ""}`} onClick={log}>
        {justLogged ? "✓ Logged — plan updated" : "Log this session"}
      </button>

      {/* What we learned */}
      <div className={`fb-insight${insight.samples > 0 ? " on" : ""}`}>
        <div className="fb-insight-head">
          <strong>What we learned</strong>
          <span className="pill">
            {insight.samples} logged · {CONF_LABEL[insight.confidence]}
          </span>
        </div>
        <div className="fb-badges">
          {insight.carbCeilingG !== undefined && <span className="fb-badge cap">carb ceiling {insight.carbCeilingG} g/h</span>}
          {(insight.carbBiasG ?? 0) > 0 && <span className="fb-badge up">+{insight.carbBiasG} g/h</span>}
          {insight.carbCeilingG === undefined && !(insight.carbBiasG ?? 0) && <span className="fb-badge">targets unchanged</span>}
        </div>
        <ul className="fb-rationale">
          {insight.rationale.map((r, i) => (
            <li key={i}>{r}</li>
          ))}
        </ul>
      </div>

      {feedbacks.length > 0 && (
        <ul className="fb-history">
          {feedbacks.slice(0, 5).map((f) => (
            <li key={f.id}>
              <span className="fb-when">{new Date(f.date).toLocaleDateString()}</span>
              <span className={`fb-tag gi-${f.gi}`}>GI {f.gi}</span>
              <span className={`fb-tag en-${f.energy}`}>{f.energy}</span>
              <span className="fb-planned">@ {f.plannedCarbPerHourG} g/h</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
