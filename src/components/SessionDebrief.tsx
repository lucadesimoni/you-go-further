import { useState } from "react";
import type { SessionDebrief as Debrief } from "../analysis";
import type { RouteFuelPlan } from "../engine";
import type { GiRating, EnergyRating, SessionFeedback } from "../feedback";
import { useT, type TranslationKey } from "../i18n";
import { ChoiceRow } from "./Choice";

const VERDICT_KEY: Record<Debrief["verdict"], TranslationKey> = {
  "under-fuelled": "debrief.verdictUnderFuelled",
  "about-right": "debrief.verdictAboutRight",
  "over-gut": "debrief.verdictOverGut",
  unknown: "debrief.verdictUnknown",
};

const GI: GiRating[] = ["none", "mild", "severe"];
const ENERGY: EnergyRating[] = ["bonked", "faded", "steady", "strong"];

/**
 * The post-run debrief: what this session demanded, what the athlete actually
 * did, and precisely where and what they should have taken.
 *
 * When the session hasn't been logged the panel *asks* rather than reporting an
 * empty state — the log is the missing input, so requesting it is the single
 * most useful thing this surface can do. Once logged it turns into the answer,
 * in the same place, without navigating anywhere.
 */
export function SessionDebrief({
  debrief,
  plan,
  onLog,
  saving,
}: {
  debrief: Debrief;
  plan: RouteFuelPlan;
  /** Save a log for this session; the parent re-derives the debrief. */
  onLog?: (entry: Pick<SessionFeedback, "gi" | "energy" | "actualCarbPerHourG">) => void;
  saving?: boolean;
}) {
  const t = useT();
  const [gi, setGi] = useState<GiRating>("none");
  const [energy, setEnergy] = useState<EnergyRating>("steady");
  const [actual, setActual] = useState(Math.max(0, Math.round(debrief.requiredCarbPerHourG * 0.6)));

  const verdictTone =
    debrief.verdict === "about-right" ? "good" : debrief.verdict === "unknown" ? "muted" : "warn";

  return (
    <section className="debrief">
      <div className="section-head">
        <h3 className="debrief-title">{t("debrief.title")}</h3>
        <span className={`debrief-verdict debrief-verdict-${verdictTone}`}>{t(VERDICT_KEY[debrief.verdict])}</span>
      </div>

      {/* Ask for the missing input rather than showing an empty panel. */}
      {!debrief.hasLog && onLog && (
        <div className="debrief-log">
          <h4 className="debrief-ask">{t("debrief.howWasIt")}</h4>
          <p className="detail">{t("finding.noLog")}</p>

          <ChoiceRow
            label={t("debrief.gut")}
            value={gi}
            onChange={setGi}
            options={GI.map((g) => ({ value: g, label: t(`debrief.gi.${g}` as TranslationKey) }))}
          />

          <ChoiceRow
            label={t("debrief.energy")}
            value={energy}
            onChange={setEnergy}
            options={ENERGY.map((e) => ({ value: e, label: t(`debrief.energy.${e}` as TranslationKey) }))}
          />

          <label htmlFor="debrief-actual">
            {t("debrief.actualCarbs")} <span className="value">{actual} g/h</span>
          </label>
          <input
            id="debrief-actual"
            type="range"
            min={0}
            max={120}
            step={5}
            value={actual}
            onChange={(e) => setActual(Number(e.target.value))}
          />

          <button
            type="button"
            className="btn btn-primary"
            disabled={saving}
            onClick={() => onLog({ gi, energy, actualCarbPerHourG: actual })}
          >
            {saving ? "…" : t("debrief.save")}
          </button>
        </div>
      )}

      {debrief.hasLog && (
        <div className="debrief-compare">
          <div className="debrief-figure">
            <span className="debrief-figure-value">{debrief.requiredCarbPerHourG} g/h</span>
            <span className="debrief-figure-label">{t("debrief.needed")}</span>
          </div>
          {debrief.actualCarbPerHourG !== undefined && (
            <>
              <div className="debrief-figure">
                <span className="debrief-figure-value">{debrief.actualCarbPerHourG} g/h</span>
                <span className="debrief-figure-label">{t("debrief.youTook")}</span>
              </div>
              <div className={`debrief-gap${(debrief.gapPerHourG ?? 0) >= 10 ? " debrief-gap-short" : ""}`}>
                {(debrief.gapPerHourG ?? 0) >= 10
                  ? t("debrief.short", { gap: debrief.gapPerHourG ?? 0 })
                  : t("debrief.onTarget")}
              </div>
            </>
          )}
        </div>
      )}

      <ul className="debrief-findings">
        {debrief.findings
          // The prompt is the form above; don't repeat it as a finding.
          .filter((f) => f.id !== "noLog" || debrief.hasLog)
          .map((f, i) => {
            const key = `finding.${f.id}` as TranslationKey;
            const text = t(key, f.vars);
            return <li key={i}>{text === key ? f.text : text}</li>;
          })}
      </ul>

      {/* The actionable half — where and what — is the chart directly below,
          which carries the same stops. Printing them twice would be two lists
          the athlete has to reconcile. */}
      {debrief.hasLog && plan.stops.length > 0 && <p className="debrief-lead">{t("debrief.leadToPlan")}</p>}
    </section>
  );
}
