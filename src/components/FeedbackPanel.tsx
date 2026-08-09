import { useState } from "react";
import type { AdaptationInsight, EnergyRating, GiRating, SessionFeedback } from "../feedback";
import { useT } from "../i18n";

/* The same ratings the debrief uses, so one vocabulary describes a session
   whether it is being logged or reviewed. */
const GI_OPTS: GiRating[] = ["none", "mild", "severe"];
const ENERGY_OPTS: EnergyRating[] = ["bonked", "faded", "steady", "strong"];

/** Confidence, keyed rather than spelled out, so it reads in every language. */
const CONF_KEY = {
  none: "log.confNone",
  low: "log.confLow",
  medium: "log.confMedium",
  high: "log.confHigh",
} as const;

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
  const t = useT();
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
        <h3 style={{ margin: 0, fontSize: 17 }}>{t("log.title")}</h3>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span className={`pill${persistence === "server" ? " pill-live" : ""}`}>
            {persistence === "server" ? t("log.synced") : t("profile.savedLocally")}
          </span>
          {feedbacks.length > 0 && (
            <button type="button" className="btn btn-ghost" onClick={onReset}>
              {t("log.clear")}
            </button>
          )}
        </div>
      </div>
      <p className="detail">{t("log.sub")}</p>

      <div className="fb-row">
        <div className="field">
          <span className="group-label">{t("log.gut")}</span>
          <div className="segmented" style={{ gridTemplateColumns: "repeat(3,1fr)" }}>
            {GI_OPTS.map((o) => (
              <button key={o} type="button" className={gi === o ? "seg active" : "seg"} onClick={() => setGi(o)}>
                {t(`debrief.gi.${o}`)}
              </button>
            ))}
          </div>
        </div>
        <div className="field">
          <span className="group-label">{t("log.energy")}</span>
          <div className="segmented">
            {ENERGY_OPTS.map((o) => (
              <button key={o} type="button" className={energy === o ? "seg active" : "seg"} onClick={() => setEnergy(o)}>
                {t(`debrief.energy.${o}`)}
              </button>
            ))}
          </div>
        </div>
      </div>

      <button type="button" className={`btn btn-primary${justLogged ? " done" : ""}`} onClick={log}>
        {justLogged ? t("log.logged") : t("log.logSession")}
      </button>

      {/* What we learned */}
      <div className={`fb-insight${insight.samples > 0 ? " on" : ""}`}>
        <div className="fb-insight-head">
          <strong>{t("log.learned")}</strong>
          <span className="pill">
            {insight.samples} logged · {t(CONF_KEY[insight.confidence])}
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
