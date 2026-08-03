import { useEffect, useMemo, useState } from "react";
import { buildSchedule, recommend, CATALOG } from "../engine";
import type { AthleteInput, Product } from "../engine";
import { deriveAdaptation, toAdaptation, type EnergyRating, type GiRating, type SessionFeedback } from "../feedback";
import type { Role } from "../auth";
import { addFeedback, clearFeedback, feedbackPersistence, loadFeedback } from "../api/feedbackStore";
import { loadCatalog } from "../api/productLibrary";
import { loadProfile } from "../api/profileStore";
import { ACTIVITIES, CONDITIONS, GOALS, INTENSITIES, PHASE_KEYS, SWEAT_TEXT_KEYS } from "../options";
import { Stat } from "./Stat";
import { SessionTimeline } from "./SessionTimeline";
import { CartPanel } from "./CartPanel";
import { FeedbackPanel } from "./FeedbackPanel";
import { OfferingPanel } from "./OfferingPanel";
import { EnergyProfile } from "./EnergyProfile";
import { useT } from "../i18n";
import { BuyLink } from "./BuyLink";
import { Explain } from "./Explain";

/** Only session-specific fields live in the planner now; body data comes from the profile. */
export type SessionInput = Pick<AthleteInput, "goal" | "activity" | "durationMin" | "intensity" | "conditions">;

const DEFAULT_SESSION: SessionInput = {
  goal: "endurance-performance",
  activity: "running",
  durationMin: 90,
  intensity: "moderate",
  conditions: "temperate",
};


/** Standalone session fuel planner. Body/health data is read from Profile settings. */
export function Planner({
  initial,
  role = "athlete",
  onEditProfile,
}: {
  initial?: Partial<SessionInput>;
  role?: Role;
  onEditProfile?: () => void;
}) {
  const t = useT();
  const [input, setInput] = useState<SessionInput>({ ...DEFAULT_SESSION, ...initial });
  const profile = useMemo(() => loadProfile(), []);

  const [feedbacks, setFeedbacks] = useState<SessionFeedback[]>([]);
  const insight = useMemo(() => deriveAdaptation(feedbacks), [feedbacks]);
  const [catalog, setCatalog] = useState<Product[]>(CATALOG);

  useEffect(() => {
    let cancelled = false;
    loadFeedback(role)
      .then((list) => !cancelled && setFeedbacks(list))
      .catch(() => !cancelled && setFeedbacks([]));
    loadCatalog()
      .then((list) => !cancelled && list.length && setCatalog(list))
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [role]);

  // Merge session inputs with the athlete's stored body/health profile.
  const effectiveInput = useMemo<AthleteInput>(
    () => ({
      ...input,
      bodyWeightKg: profile.bodyWeightKg,
      sweatLevel: profile.sweatLevel,
      caffeineOk: profile.caffeineOk,
      physiology: profile.useSignals
        ? {
            sweatRateMlPerH: profile.sweatRateMlPerH,
            sweatSodiumMgPerL: profile.sweatSodiumMgPerL,
            readiness: profile.readiness,
          }
        : undefined,
      adaptation: insight.samples > 0 ? toAdaptation(insight) : undefined,
    }),
    [input, profile, insight],
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

  const set = <K extends keyof SessionInput>(key: K, value: SessionInput[K]) =>
    setInput((prev) => ({ ...prev, [key]: value }));

  const hours = Math.floor(input.durationMin / 60);
  const mins = input.durationMin % 60;
  const durationLabel = `${hours ? `${hours} h ` : ""}${mins ? `${mins} min` : hours ? "" : "0 min"}`.trim();

  return (
    <main className="layout">
      <section className="panel form" aria-label={t("plan.sessionDetails")}>
        <div className="field">
          <label htmlFor="goal">{t("plan.goal")}</label>
          <select id="goal" value={input.goal} onChange={(e) => set("goal", e.target.value as SessionInput["goal"])}>
            {GOALS.map((g) => (
              <option key={g.value} value={g.value}>
                {t(g.labelKey)} — {t(g.blurbKey)}
              </option>
            ))}
          </select>
        </div>

        <div className="field">
          <label htmlFor="activity">{t("plan.activity")}</label>
          <select
            id="activity"
            value={input.activity}
            onChange={(e) => set("activity", e.target.value as SessionInput["activity"])}
          >
            {ACTIVITIES.map((a) => (
              <option key={a.value} value={a.value}>
                {t(a.labelKey)}
              </option>
            ))}
          </select>
        </div>

        <div className="field">
          <label htmlFor="duration">
            {t("plan.duration")} <span className="value">{durationLabel}</span>
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
          <span className="group-label">{t("plan.intensity")}</span>
          <div className="segmented" role="group" aria-label={t("plan.intensity")}>
            {INTENSITIES.map((i) => (
              <button
                key={i.value}
                type="button"
                className={input.intensity === i.value ? "seg active" : "seg"}
                onClick={() => set("intensity", i.value)}
              >
                {t(i.labelKey)}
              </button>
            ))}
          </div>
        </div>

        <div className="field">
          <label htmlFor="conditions">{t("plan.conditions")}</label>
          <select
            id="conditions"
            value={input.conditions}
            onChange={(e) => set("conditions", e.target.value as SessionInput["conditions"])}
          >
            {CONDITIONS.map((c) => (
              <option key={c.value} value={c.value}>
                {t(c.labelKey)}
              </option>
            ))}
          </select>
        </div>

        <div className="from-profile">
          <span>
            {t("plan.tunedTo")} <strong>{profile.bodyWeightKg} kg</strong> · {t(SWEAT_TEXT_KEYS[profile.sweatLevel])}
            {profile.caffeineOk ? ` · ${t("plan.caffeineOk")}` : ""}
            {profile.useSignals ? ` · ${t("plan.measuredSignals")}` : ""}
          </span>
          {onEditProfile && (
            <button type="button" className="link-btn" onClick={onEditProfile}>
              {t("plan.editProfile")}
            </button>
          )}
        </div>
      </section>

      <section className="results" aria-live="polite">
        <div className="targets panel">
          <Stat label={t("plan.carbPerHour")} value={rec.target.carbPerHourG ? `${rec.target.carbPerHourG} g` : "—"} />
          <Stat label={t("plan.carbTotal")} value={rec.target.carbTotalG ? `${rec.target.carbTotalG} g` : "—"} />
          <Stat
            label={t("plan.fluidPerHour")}
            value={`${rec.target.fluidPerHourMl} ml`}
            note={rec.target.hydrationSource === "measured" ? t("plan.measured") : undefined}
          />
          <Stat
            label={t("plan.sodiumPerLitreLong")}
            value={`${rec.target.sodiumPerLitreMg} mg`}
            note={rec.target.sodiumSource === "measured" ? t("plan.measured") : undefined}
          />
        </div>

        {/* A target the chosen products cannot absorb is not an ambitious plan,
            it is an impossible one — and the failure lands mid-race. */}
        {rec.deliverability && !rec.deliverability.deliverable && (
          <div className="panel absorb-warn">
            <div className="section-head">
              <h3 className="absorb-title">{t("absorb.title")}</h3>
              <span className="pill pill-todo">
                {t("absorb.ceiling", { ceiling: rec.deliverability.ceilingG })}
              </span>
            </div>
            <p className="detail">
              {t("absorb.body", {
                target: rec.deliverability.targetG,
                ceiling: rec.deliverability.ceilingG,
                short: rec.deliverability.shortfallG,
              })}
            </p>
            <p className="absorb-fix">{rec.deliverability.fix}</p>
            <Explain>
              <p>{rec.deliverability.ceiling.reason}</p>
              <p>{t("absorb.why")}</p>
            </Explain>
          </div>
        )}

        <SessionTimeline schedule={schedule} />

        <EnergyProfile input={effectiveInput} target={rec.target} schedule={schedule} />

        {rec.phases.map((phase) => (
          <div className="panel phase" key={phase.phase}>
            <div className="phase-head">
              <span className={`badge badge-${phase.phase}`}>{t(PHASE_KEYS[phase.phase])}</span>
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
                        {p.custom && <span className="tag tag-house">{t("plan.house")}</span>}
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
                    <BuyLink product={p} />
                  </li>
                ))}
              </ul>
            )}
            {phase.rationale.length > 0 && (
              <details className="why">
                <summary>{t("plan.whyThese")}</summary>
                <ul className="why-list">
                  {phase.rationale.map((r, i) => (
                    <li key={i}>{r}</li>
                  ))}
                </ul>
              </details>
            )}
          </div>
        ))}

        <OfferingPanel input={effectiveInput} target={rec.target} catalog={catalog} />

        <details className="panel notes-details">
          <summary>{t("plan.notes")}</summary>
          <ul className="notes-list">
            {rec.notes.map((n, i) => (
              <li key={i}>{n}</li>
            ))}
          </ul>
        </details>

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
