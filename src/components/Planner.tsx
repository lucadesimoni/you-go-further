import { useEffect, useMemo, useState } from "react";
import { buildSchedule, recommend, CATALOG } from "../engine";
import type { AthleteInput, Product } from "../engine";
import { deriveAdaptation, toAdaptation, type EnergyRating, type GiRating, type SessionFeedback } from "../feedback";
import type { Role } from "../auth";
import { addFeedback, clearFeedback, feedbackPersistence, loadFeedback } from "../api/feedbackStore";
import { loadCatalog } from "../api/productLibrary";
import { loadProfile } from "../api/profileStore";
import { ACTIVITIES, CONDITIONS, GOALS, INTENSITIES, PHASE_KEYS, SWEAT_TEXT_KEYS } from "../options";
import { ChoiceCards, ChoiceRow } from "./Choice";
import { Icon } from "./Icon";
import { useMediaQuery, PHONE } from "../ui/useMediaQuery";
import { ACTIVITY_ICONS, CONDITION_ICONS, GOAL_ICONS } from "./optionIcons";
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

/** The duration slider's granularity, shared with the prefill so they agree. */
const DURATION_STEP_MIN = 5;

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
  onPrefillUsed,
}: {
  initial?: Partial<SessionInput>;
  role?: Role;
  onEditProfile?: () => void;
  /** Told once the prefill has landed, so the caller can clear it. */
  onPrefillUsed?: () => void;
}) {
  const t = useT();
  const [input, setInput] = useState<SessionInput>({ ...DEFAULT_SESSION, ...initial });
  const profile = useMemo(() => loadProfile(), []);

  /**
   * Take a prefill even when this component is already on screen.
   *
   * The initial state above only runs on mount, which was fine while every
   * prefill arrived from another tab — the planner mounted fresh and read it.
   * "Plan for this race" and "Plan for this route" sit on *this* screen, so the
   * planner was already mounted and silently ignored them: the button set a
   * value that was cleared a tick later and nothing on screen ever moved.
   *
   * The caller hands over a fresh object per request and clears it once told,
   * so this runs exactly once per press rather than looping on identity.
   */
  useEffect(() => {
    if (!initial) return;
    setInput((prev) => ({
      ...prev,
      ...initial,
      // Snap to the slider's own grid. A race estimate of 832 minutes is not a
      // multiple of five, so the control reported 830 while the label read
      // 13 h 52 min — and the first touch of the slider would have jumped.
      ...(initial.durationMin !== undefined
        ? { durationMin: Math.max(20, Math.round(initial.durationMin / DURATION_STEP_MIN) * DURATION_STEP_MIN) }
        : {}),
    }));
    onPrefillUsed?.();
  }, [initial, onPrefillUsed]);

  const isPhone = useMediaQuery(PHONE);
  /** Only meaningful on a phone; the wide layout always shows the form. */
  const [formOpen, setFormOpen] = useState(false);

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

  // Rounded up to a whole hour so the thumb never sits exactly at the end.
  const maxDurationMin = Math.max(360, Math.ceil(input.durationMin / 60) * 60);
  const hours = Math.floor(input.durationMin / 60);
  const mins = input.durationMin % 60;
  const durationLabel = `${hours ? `${hours} h ` : ""}${mins ? `${mins} min` : hours ? "" : "0 min"}`.trim();

  return (
    <main className="layout" id="session-planner">
      {/*
       * On a phone the form is folded away behind what it produced.
       *
       * On a wide screen the inputs are a sticky column beside the plan, so
       * both are visible and neither is in the way. Stacked on a phone they
       * were five controls and about a screen and a half of scrolling *before*
       * the first number — and changing one meant scrolling back up past the
       * answer. The plan is what the athlete came for, so it comes first; the
       * summary line says what it was built from, and opens the form.
       */}
      {isPhone && (
        <button
          type="button"
          className={formOpen ? "session-summary open" : "session-summary"}
          aria-expanded={formOpen}
          aria-controls="session-form"
          onClick={() => setFormOpen((v) => !v)}
        >
          <span className="session-summary-line">
            <Icon name={ACTIVITY_ICONS[input.activity]} />
            <strong>{durationLabel}</strong>
            <span>{t(ACTIVITIES.find((a) => a.value === input.activity)!.labelKey)}</span>
            <span>·</span>
            <span>{t(INTENSITIES.find((i) => i.value === input.intensity)!.labelKey)}</span>
            <span>·</span>
            <span>{t(CONDITIONS.find((c) => c.value === input.conditions)!.labelKey)}</span>
          </span>
          <span className="session-summary-action">{formOpen ? t("plan.done") : t("plan.adjust")}</span>
        </button>
      )}

      <section
        id="session-form"
        className={isPhone && !formOpen ? "panel form form-folded" : "panel form"}
        aria-label={t("plan.sessionDetails")}
      >
        {/* Cards, not a dropdown: the blurb is the difference between "Race
            preparation" and "Endurance performance" for anyone choosing
            between them for the first time, and a native select cut it off. */}
        <ChoiceCards
          label={t("plan.goal")}
          value={input.goal}
          onChange={(v) => set("goal", v)}
          options={GOALS.map((g) => ({
            value: g.value,
            label: t(g.labelKey),
            blurb: t(g.blurbKey),
            icon: GOAL_ICONS[g.value],
          }))}
        />

        <ChoiceRow
          label={t("plan.activity")}
          value={input.activity}
          onChange={(v) => set("activity", v)}
          options={ACTIVITIES.map((a) => ({
            value: a.value,
            label: t(a.labelKey),
            icon: ACTIVITY_ICONS[a.value],
          }))}
        />

        <div className="field">
          <label htmlFor="duration">
            {t("plan.duration")} <span className="value">{durationLabel}</span>
          </label>
          {/* Six hours covers training, and keeping the scale there is what
              makes the slider usable for the everyday case. It stretches only
              when a longer session is actually loaded — a race prefill for the
              Inferno Triathlon or a 100 km ultra would otherwise arrive at
              13:52 and sit pinned to a maximum it could never reach. */}
          <input
            id="duration"
            type="range"
            min={20}
            max={maxDurationMin}
            step={DURATION_STEP_MIN}
            value={input.durationMin}
            onChange={(e) => set("durationMin", Number(e.target.value))}
          />
        </div>

        <ChoiceRow
          label={t("plan.intensity")}
          value={input.intensity}
          onChange={(v) => set("intensity", v)}
          options={INTENSITIES.map((i) => ({ value: i.value, label: t(i.labelKey) }))}
        />

        <ChoiceRow
          label={t("plan.conditions")}
          value={input.conditions}
          onChange={(v) => set("conditions", v)}
          options={CONDITIONS.map((c) => ({
            value: c.value,
            label: t(c.labelKey),
            icon: CONDITION_ICONS[c.value],
          }))}
        />

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
            tone="good"
          />
          <Stat
            label={t("plan.sodiumPerLitreLong")}
            value={`${rec.target.sodiumPerLitreMg} mg`}
            note={rec.target.sodiumSource === "measured" ? t("plan.measured") : undefined}
            tone="good"
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
              <h3>{t(`phase.${phase.headlineId}`, phase.values)}</h3>
            </div>
            <p className="detail">{t(`phaseDetail.${phase.detailId}`, phase.values)}</p>
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
                    {/* One quiet line instead of five coloured chips.
                        Six products on a plan meant thirty chips competing with
                        the numbers that actually decide the session — the macros
                        are still all here, they have simply stopped shouting. */}
                    <p className="product-macros">
                      {[
                        p.carbsG > 1 ? t("unit.carb", { n: p.carbsG }) : null,
                        p.sodiumMg > 0 ? t("unit.sodium", { n: p.sodiumMg }) : null,
                        p.proteinG ? t("unit.protein", { n: p.proteinG }) : null,
                        p.caffeineMg ? t("unit.caffeine", { n: p.caffeineMg }) : null,
                        p.multiTransportable ? t("plan.multiTransportable") : null,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                    {/* Kept: "fast carbs on the move, take with water" is usage
                        guidance, not marketing — it is the chips that were the
                        noise, not this. */}
                    {p.notes && <p className="product-note">{p.notes}</p>}
                    <div className="product-foot">
                      <BuyLink product={p} />
                    </div>
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
