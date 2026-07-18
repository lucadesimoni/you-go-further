import { CATALOG } from "./catalog";
import type {
  AthleteInput,
  FuelingTarget,
  Goal,
  Intensity,
  PhasePlan,
  Product,
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
  return clamp(round5(c), 0, 120);
}

function fluidPerHour(input: AthleteInput): number {
  const base: Record<Intensity, number> = { easy: 400, moderate: 550, hard: 650, race: 700 };
  let ml = base[input.intensity];
  if (input.conditions === "hot") ml += 200;
  if (input.conditions === "cool") ml -= 100;
  if (input.sweatLevel === "heavy") ml += 150;
  if (input.sweatLevel === "light") ml -= 100;
  return clamp(round5(ml), 300, 1000);
}

function sodiumPerLitre(input: AthleteInput): number {
  let mg = 500;
  if (input.sweatLevel === "heavy") mg = 800;
  if (input.sweatLevel === "light") mg = 350;
  if (input.conditions === "hot") mg += 150;
  return clamp(round5(mg), 300, 1100);
}

export function computeTarget(input: AthleteInput): FuelingTarget {
  const carbPerHourG = carbPerHour(input);
  const hours = input.durationMin / 60;
  return {
    carbPerHourG,
    carbTotalG: Math.round(carbPerHourG * hours),
    fluidPerHourMl: fluidPerHour(input),
    sodiumPerLitreMg: sodiumPerLitre(input),
    requiresMultiTransportable: carbPerHourG > 60,
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
  const demanding = input.durationMin >= 60 || input.intensity === "hard" || input.intensity === "race";
  return { carbG: Math.round(input.bodyWeightKg * carbPerKg * (demanding ? 1 : 0.5)), proteinG };
}

const wantsCaffeine = (input: AthleteInput) =>
  Boolean(input.caffeineOk) && (input.durationMin >= 90 || input.intensity === "race" || input.intensity === "hard");

const needsExtraSodium = (input: AthleteInput) =>
  input.sweatLevel === "heavy" || input.conditions === "hot";

/** Rank the during-session products for this athlete and return the top matches. */
function duringProducts(input: AthleteInput, target: FuelingTarget): Product[] {
  const pool = CATALOG.filter((p) => p.phases.includes("during"));
  const picks: Product[] = [];

  const carbSources = pool.filter((p) => p.carbsG > 5);
  const eligibleCarbs = target.requiresMultiTransportable
    ? carbSources.filter((p) => p.multiTransportable)
    : carbSources;

  if (target.carbPerHourG > 0) {
    // Primary carb source: a drink mix carries carbs, fluid and sodium at once.
    const drink = eligibleCarbs
      .filter((p) => p.category === "drink-mix")
      .sort((a, b) => b.carbsG - a.carbsG)[0];
    if (drink) picks.push(drink);

    // A gel for topping up carbs on the move; caffeinated only if the athlete
    // opted in. The plain fallback still respects the multi-transportable rule.
    const allGels = pool.filter((p) => p.category === "gel" && p.carbsG > 5);
    let gel: Product | undefined;
    if (wantsCaffeine(input)) gel = allGels.find((p) => p.caffeineMg);
    if (!gel) {
      const plain = target.requiresMultiTransportable
        ? allGels.filter((p) => p.multiTransportable && !p.caffeineMg)
        : allGels.filter((p) => !p.caffeineMg);
      gel = plain[0];
    }
    if (gel) picks.push(gel);
  } else {
    // No carbs needed — offer a calorie-free hydration option.
    const tab = pool.find((p) => p.category === "electrolyte" && p.carbsG <= 1);
    if (tab) picks.push(tab);
  }

  // Extra standalone sodium for heavy sweaters / heat.
  if (needsExtraSodium(input)) {
    const salt = pool
      .filter((p) => p.category === "electrolyte")
      .sort((a, b) => b.sodiumMg - a.sodiumMg)[0];
    if (salt && !picks.includes(salt)) picks.push(salt);
  }

  return picks.slice(0, 3);
}

function bestFor(phase: "pre" | "post", predicate: (p: Product) => boolean): Product[] {
  return CATALOG.filter((p) => p.phases.includes(phase) && predicate(p));
}

function buildPhases(input: AthleteInput, target: FuelingTarget): PhasePlan[] {
  const phases: PhasePlan[] = [];
  const pre = preCarbGrams(input);
  const { carbG: postCarb, proteinG: postProtein } = postGrams(input);

  // --- Pre ---
  phases.push({
    phase: "pre",
    headline: `~${pre} g carbohydrate, 1–3 h before`,
    detail:
      input.goal === "weight-loss"
        ? "Keep it light and mostly carbohydrate; enough to work hard without a big pre-load."
        : "A carbohydrate-focused meal or snack, low in fat and fibre, timed 1–3 h out. Sip 5–7 ml/kg fluid beforehand.",
    products: bestFor("pre", (p) => p.carbsG >= 20).slice(0, 2),
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
  phases.push({
    phase: "during",
    headline:
      target.carbPerHourG === 0
        ? `Hydration only · ~${target.fluidPerHourMl} ml/h`
        : `${target.carbPerHourG} g carb/h · ${target.fluidPerHourMl} ml/h`,
    detail: duringDetail,
    products: duringProducts(input, target),
  });

  // --- Post ---
  phases.push({
    phase: "post",
    headline: `~${postCarb} g carbohydrate + ~${postProtein} g protein`,
    detail:
      input.goal === "weight-loss"
        ? "Prioritise protein for recovery and keep post-session carbs modest to preserve the energy deficit."
        : "Refuel within ~60 min, especially before another session inside 24 h. Combine carbohydrate and protein, and replace fluids at ~1.5× losses.",
    products: bestFor("post", (p) => p.category === "recovery" || (p.proteinG ?? 0) >= 10).slice(0, 2),
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
  notes.push("General guidance for healthy adults, not medical advice. Check current product labels before racing.");
  return notes;
}

/**
 * Produce a full, personalized endurance-nutrition recommendation from an
 * athlete's goal and planned session.
 */
export function recommend(input: AthleteInput): Recommendation {
  const target = computeTarget(input);
  return {
    input,
    target,
    phases: buildPhases(input, target),
    notes: buildNotes(input, target),
  };
}
