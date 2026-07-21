import { CATALOG } from "./catalog";
import { idealOffering, type OfferingSlot, type OfferingSlotResult } from "./offering";
import type {
  AthleteInput,
  FuelingTarget,
  Goal,
  Intensity,
  PhasePlan,
  Product,
  Provenance,
  Recommendation,
} from "./types";

const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n));
const round5 = (n: number) => Math.round(n / 5) * 5;

/**
 * Carbohydrate grams per hour to target *during* the session, before goal
 * adjustment. Follows mainstream endurance guidance: little/none for short
 * efforts, 30–60 g/h for 1–2.5 h, and 60–90 g/h for the longest sessions.
 */
function baseCarbPerHour(durationMin: number, intensity: Intensity): number {
  const hard = intensity === "hard" || intensity === "race";
  if (durationMin < 45) return 0;
  if (durationMin < 75) return hard ? 30 : intensity === "moderate" ? 20 : 0;
  if (durationMin < 150) return hard ? 60 : intensity === "moderate" ? 45 : 30;
  return hard ? 90 : intensity === "moderate" ? 70 : 50;
}

/** Multiplier applied to the during-session carb target for each goal. */
function goalCarbFactor(goal: Goal): number {
  switch (goal) {
    case "race-preparation":
      return 1.15; // practise racing at the top of the tolerable range
    case "endurance-performance":
      return 1.1;
    case "recovery-focus":
      return 1.0;
    case "general-fitness":
      return 0.85;
    case "weight-loss":
      return 0.6; // fuel the hard/long work, strip carbs from the easy stuff
  }
}

function carbPerHour(input: AthleteInput): number {
  let c = baseCarbPerHour(input.durationMin, input.intensity) * goalCarbFactor(input.goal);
  // On weight-loss, short easy/moderate sessions are done fasted / water only.
  if (input.goal === "weight-loss" && input.durationMin < 90 && input.intensity !== "race") {
    c = 0;
  }
  // Apply learned adaptation from the athlete's own logged sessions.
  if (c > 0 && input.adaptation) {
    c += input.adaptation.carbBiasG ?? 0;
    const ceiling = input.adaptation.carbCeilingG;
    if (ceiling !== undefined) c = Math.min(c, ceiling);
  }
  return clamp(round5(c), 0, 120);
}

function fluidPerHour(input: AthleteInput): { ml: number; source: Provenance } {
  // Measured sweat rate wins: replace ~80% of losses, capped at gut absorption.
  const sweat = input.physiology?.sweatRateMlPerH;
  if (sweat && sweat > 0) {
    return { ml: clamp(round5(sweat * 0.8), 350, 1200), source: "measured" };
  }
  const base: Record<Intensity, number> = { easy: 400, moderate: 550, hard: 650, race: 700 };
  let ml = base[input.intensity];
  if (input.conditions === "hot") ml += 200;
  if (input.conditions === "cool") ml -= 100;
  if (input.sweatLevel === "heavy") ml += 150;
  if (input.sweatLevel === "light") ml -= 100;
  return { ml: clamp(round5(ml), 300, 1000), source: "estimated" };
}

function sodiumPerLitre(input: AthleteInput): { mg: number; source: Provenance } {
  // A sweat test gives the athlete's actual concentration — use it directly.
  const measured = input.physiology?.sweatSodiumMgPerL;
  if (measured && measured > 0) {
    return { mg: clamp(round5(measured), 300, 1500), source: "measured" };
  }
  let mg = 500;
  if (input.sweatLevel === "heavy") mg = 800;
  if (input.sweatLevel === "light") mg = 350;
  if (input.conditions === "hot") mg += 150;
  return { mg: clamp(round5(mg), 300, 1100), source: "estimated" };
}

export function computeTarget(input: AthleteInput): FuelingTarget {
  const carbPerHourG = carbPerHour(input);
  const hours = input.durationMin / 60;
  const fluid = fluidPerHour(input);
  const sodium = sodiumPerLitre(input);
  return {
    carbPerHourG,
    carbTotalG: Math.round(carbPerHourG * hours),
    fluidPerHourMl: fluid.ml,
    sodiumPerLitreMg: sodium.mg,
    requiresMultiTransportable: carbPerHourG > 60,
    hydrationSource: fluid.source,
    sodiumSource: sodium.source,
  };
}

/** Pre-session carbohydrate grams (a meal/snack 1–3 h before). */
function preCarbGrams(input: AthleteInput): number {
  const long = input.durationMin >= 90;
  const hard = input.intensity === "hard" || input.intensity === "race";
  let perKg = long || hard ? 1.5 : 0.8;
  if (input.intensity === "race" && long) perKg = 2;
  if (input.goal === "weight-loss") perKg = Math.max(0.5, perKg - 0.6);
  return Math.round(input.bodyWeightKg * perKg);
}

/** Post-session recovery carbohydrate and protein grams. */
function postGrams(input: AthleteInput): { carbG: number; proteinG: number } {
  const proteinG = Math.round(input.bodyWeightKg * 0.3);
  let carbPerKg = 0.8;
  if (input.goal === "recovery-focus") carbPerKg = 1.2;
  if (input.goal === "endurance-performance" || input.goal === "race-preparation") carbPerKg = 1.0;
  if (input.goal === "weight-loss") carbPerKg = 0.4;
  // Low training readiness → lean into recovery to close the gap faster.
  const readiness = input.physiology?.readiness;
  if (readiness !== undefined && readiness < 45 && input.goal !== "weight-loss") carbPerKg *= 1.15;
  const demanding = input.durationMin >= 60 || input.intensity === "hard" || input.intensity === "race";
  return { carbG: Math.round(input.bodyWeightKg * carbPerKg * (demanding ? 1 : 0.5)), proteinG };
}

/** HRV status relative to the athlete's baseline. */
function hrvStatus(input: AthleteInput): "suppressed" | "balanced" | "elevated" | undefined {
  const { hrvMs, hrvBaselineMs } = input.physiology ?? {};
  if (!hrvMs || !hrvBaselineMs) return undefined;
  const ratio = hrvMs / hrvBaselineMs;
  if (ratio < 0.9) return "suppressed";
  if (ratio > 1.1) return "elevated";
  return "balanced";
}

const needsExtraSodium = (input: AthleteInput) =>
  input.sweatLevel === "heavy" ||
  input.conditions === "hot" ||
  (input.physiology?.sweatSodiumMgPerL ?? 0) >= 900;

/** Prefix a slot's reasons with the product name so a combined list reads clearly. */
function reasonsFor(slot: OfferingSlotResult): string[] {
  const pick = slot.pick;
  if (!pick) return [];
  const [first, ...rest] = pick.reasons;
  return [`${pick.product.brand} ${pick.product.name} — ${first}`, ...rest];
}

function buildPhases(input: AthleteInput, target: FuelingTarget, catalog: Product[]): PhasePlan[] {
  // Product selection is delegated to the offering engine — the single source of
  // truth for which product fits which slot, and why.
  const offering = idealOffering(input, target, catalog);
  const slot = (s: OfferingSlot) => offering.slots.find((x) => x.slot === s);

  const phases: PhasePlan[] = [];
  const pre = preCarbGrams(input);
  const { carbG: postCarb, proteinG: postProtein } = postGrams(input);

  // --- Pre ---
  const preSlot = slot("pre-fuel");
  const prePicks = preSlot?.pick ? [preSlot.pick.product, ...preSlot.alternatives.map((a) => a.product)] : [];
  phases.push({
    phase: "pre",
    headline: `~${pre} g carbohydrate, 1–3 h before`,
    detail:
      input.goal === "weight-loss"
        ? "Keep it light and mostly carbohydrate; enough to work hard without a big pre-load."
        : "A carbohydrate-focused meal or snack, low in fat and fibre, timed 1–3 h out. Sip 5–7 ml/kg fluid beforehand.",
    products: prePicks.slice(0, 2),
    rationale: preSlot ? reasonsFor(preSlot) : [],
  });

  // --- During ---
  const duringDetail =
    target.carbPerHourG === 0
      ? `Session is short/easy enough to run on water. Aim for ~${target.fluidPerHourMl} ml/h${
          needsExtraSodium(input) ? `, with ${target.sodiumPerLitreMg} mg sodium per litre.` : "."
        }`
      : `Take ~${target.carbPerHourG} g carbohydrate per hour (≈${target.carbTotalG} g total), ~${target.fluidPerHourMl} ml/h fluid with ${target.sodiumPerLitreMg} mg sodium per litre.` +
        (target.requiresMultiTransportable
          ? " At this rate you need glucose+fructose (multiple transportable carbs) to absorb it."
          : "");
  // Assemble the during combo from the needed slots, in order, de-duplicated.
  const duringSlots = [slot("carb-carrier"), slot("carb-topup"), slot("hydration"), slot("electrolyte")];
  const duringProducts: Product[] = [];
  const duringRationale: string[] = [];
  for (const s of duringSlots) {
    if (!s?.needed || !s.pick) continue;
    if (duringProducts.some((p) => p.id === s.pick!.product.id)) continue;
    duringProducts.push(s.pick.product);
    duringRationale.push(...reasonsFor(s));
  }
  phases.push({
    phase: "during",
    headline:
      target.carbPerHourG === 0
        ? `Hydration only · ~${target.fluidPerHourMl} ml/h`
        : `${target.carbPerHourG} g carb/h · ${target.fluidPerHourMl} ml/h`,
    detail: duringDetail,
    products: duringProducts.slice(0, 3),
    rationale: duringRationale.slice(0, 3),
  });

  // --- Post ---
  const postSlot = slot("recovery");
  const postPicks = postSlot?.pick ? [postSlot.pick.product, ...postSlot.alternatives.map((a) => a.product)] : [];
  phases.push({
    phase: "post",
    headline: `~${postCarb} g carbohydrate + ~${postProtein} g protein`,
    detail:
      input.goal === "weight-loss"
        ? "Prioritise protein for recovery and keep post-session carbs modest to preserve the energy deficit."
        : "Refuel within ~60 min, especially before another session inside 24 h. Combine carbohydrate and protein, and replace fluids at ~1.5× losses.",
    products: postPicks.slice(0, 2),
    rationale: postSlot ? reasonsFor(postSlot) : [],
  });

  return phases;
}

function buildNotes(input: AthleteInput, target: FuelingTarget): string[] {
  const notes: string[] = [];
  switch (input.goal) {
    case "race-preparation":
      notes.push(
        "Rehearse this exact fueling in training — 'nothing new on race day'. Train your gut to tolerate the higher carb rate over several weeks.",
      );
      break;
    case "weight-loss":
      notes.push(
        "Carbohydrate is periodised down on easy sessions to support fat loss, but hard and long sessions are still fueled so training quality holds up.",
      );
      break;
    case "endurance-performance":
      notes.push("Progressively build carbohydrate tolerance toward the top of the range for your longest efforts.");
      break;
    case "recovery-focus":
      notes.push("Post-session refueling is dialled up to speed recovery between sessions.");
      break;
    case "general-fitness":
      notes.push("Targets are kept moderate — enough to train comfortably without over-fueling.");
      break;
  }
  if (target.requiresMultiTransportable) {
    notes.push("Split intake across drink + gels so no single source dumps too much sugar at once.");
  }
  if (input.conditions === "hot") {
    notes.push("In the heat, start hydrated, drink to thirst plus a bit, and don't skip sodium.");
  }
  if (input.activity === "swimming") {
    notes.push("Fueling mid-swim is impractical — front-load carbs pre-session and refuel promptly after.");
  }

  // Physiology-driven, personalized notes — the "optimized for your body" layer.
  if (target.hydrationSource === "measured") {
    notes.push(
      `Hydration is set from your measured sweat rate (${input.physiology?.sweatRateMlPerH} ml/h), not a population estimate.`,
    );
  }
  if (target.sodiumSource === "measured") {
    notes.push(
      `Sodium matches your sweat test (${input.physiology?.sweatSodiumMgPerL} mg/L) — ${
        (input.physiology?.sweatSodiumMgPerL ?? 0) >= 900 ? "you're a salty sweater, so this runs high." : "dialled to your chemistry."
      }`,
    );
  }
  const readiness = input.physiology?.readiness;
  if (readiness !== undefined) {
    if (readiness < 45) notes.push(`Readiness is low (${readiness}/100) — recovery fueling is emphasized today.`);
    else if (readiness >= 75) notes.push(`Readiness is high (${readiness}/100) — you're primed to absorb a harder, well-fueled session.`);
  }
  const hrv = hrvStatus(input);
  if (hrv === "suppressed") {
    notes.push("Overnight HRV is below your baseline — keep an eye on load and prioritise carbs + protein afterwards.");
  }

  // Learned-from-your-logs notes — the feedback loop closing.
  if (input.adaptation?.carbCeilingG !== undefined && target.carbPerHourG > 0) {
    notes.push(`Carb rate is capped at ~${input.adaptation.carbCeilingG} g/h — learned from the gut-distress you logged.`);
  }
  if ((input.adaptation?.carbBiasG ?? 0) > 0 && target.carbPerHourG > 0) {
    notes.push("Fueling nudged up from the low-energy sessions you logged — let's keep you from fading.");
  }

  notes.push("General guidance for healthy adults, not medical advice. Check current product labels before racing.");
  return notes;
}

/**
 * Produce a full, personalized endurance-nutrition recommendation from an
 * athlete's goal and planned session.
 */
export function recommend(input: AthleteInput, catalog: Product[] = CATALOG): Recommendation {
  const target = computeTarget(input);
  return {
    input,
    target,
    phases: buildPhases(input, target, catalog),
    notes: buildNotes(input, target),
  };
}
