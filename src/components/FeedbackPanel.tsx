import { useState } from "react";
import type { AdaptationInsight, EnergyRating, GiRating, SessionFeedback } from "../feedback";
import { useT, type TranslationKey } from "../i18n";
import { ChoiceRow } from "./Choice";

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

      {/* Chips that flow, not four equal columns: "Bonked / Faded / Steady /
          Strong" shares a row and "Eingebrochen / Nachgelassen / Konstant /
          Stark" does not, and the German column was being cut off. */}
      <div className="fb-row">
        <ChoiceRow
          label={t("log.gut")}
          value={gi}
          onChange={setGi}
          options={GI_OPTS.map((o) => ({ value: o, label: t(`debrief.gi.${o}`) }))}
        />
        <ChoiceRow
          label={t("log.energy")}
          value={energy}
          onChange={setEnergy}
          options={ENERGY_OPTS.map((o) => ({ value: o, label: t(`debrief.energy.${o}`) }))}
        />
      </div>

      <button type="button" className={`btn btn-primary${justLogged ? " done" : ""}`} onClick={log}>
        {justLogged ? t("log.logged") : t("log.logSession")}
      </button>

      {/* What we learned */}
      <div className={`fb-insight${insight.samples > 0 ? " on" : ""}`}>
        <div className="fb-insight-head">
          <strong>{t("log.learned")}</strong>
          <span className="pill">
            {t("log.samplesLogged", { count: insight.samples })} · {t(CONF_KEY[insight.confidence])}
          </span>
        </div>
        <div className="fb-badges">
          {insight.carbCeilingG !== undefined && <span className="fb-badge cap">{t("log.carbCeiling", { n: insight.carbCeilingG })}</span>}
          {(insight.carbBiasG ?? 0) > 0 && <span className="fb-badge up">+{insight.carbBiasG} g/h</span>}
          {insight.carbCeilingG === undefined && !(insight.carbBiasG ?? 0) && <span className="fb-badge">{t("log.targetsUnchanged")}</span>}
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
              <span className={`fb-tag gi-${f.gi}`}>GI {t(`debrief.gi.${f.gi}` as TranslationKey)}</span>
              <span className={`fb-tag en-${f.energy}`}>{t(`debrief.energy.${f.energy}` as TranslationKey)}</span>
              <span className="fb-planned">@ {f.plannedCarbPerHourG} g/h</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
