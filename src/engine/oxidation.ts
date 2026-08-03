import type { Intensity, Product } from "./types";

/**
 * Carbohydrate oxidation and absorption — the two ceilings that decide whether a
 * fuelling target is physically reachable.
 *
 * The engine used to reason about one number: grams per hour. That is only half
 * the problem. **Exogenous carbohydrate oxidation is capped by intestinal
 * transport, not by appetite**, and the cap depends on *which sugars* are in the
 * bottle:
 *
 * - **Glucose alone saturates SGLT1 at ~60 g/h.** Eating 90 g/h of pure maltodextrin
 *   does not deliver 90 g/h — the surplus sits in the gut, draws water in, and
 *   becomes the distress the athlete reports as "my stomach turned".
 * - **Glucose + fructose ~2:1** recruits GLUT5 as a second route and lifts
 *   measured oxidation to ~90 g/h, with ~105–120 g/h reported in gut-trained
 *   athletes at the top of the range (Jeukendrup 2010; Jentjens & Jeukendrup 2004;
 *   Viribay et al. 2020 for the trained upper end).
 *
 * So a plan asking for 90 g/h from gels that are glucose-only is not an
 * aggressive plan — it is an impossible one, and the failure mode is a ruined
 * race. This module lets the engine say so *before* the session rather than the
 * debrief saying it afterwards.
 *
 * Everything here is population physiology, deliberately conservative, and
 * expressed as ranges the UI can label as estimates.
 */

/** How much of a product's carbohydrate is a second transportable sugar. */
export interface CarbSources {
  /** Grams per hour of glucose-type carbohydrate (glucose, maltodextrin, starch). */
  glucoseG: number;
  /** Grams per hour of fructose-type carbohydrate (fructose, sucrose's half). */
  fructoseG: number;
}

export interface AbsorptionCeiling {
  /** Grams per hour this mix can actually deliver to the muscle. */
  ceilingG: number;
  /** The ratio achieved, e.g. 2 means 2:1 glucose:fructose. */
  ratio?: number;
  /** True when a second transportable sugar is present in a useful proportion. */
  multiTransportable: boolean;
  /** Why the ceiling is what it is — shown to the athlete, not just logged. */
  reason: string;
}

/**
 * Single-transporter ceiling. Repeatedly measured at 1.0–1.1 g/min; the
 * conservative end is used so a plan is never built on the best case.
 */
export const GLUCOSE_ONLY_CEILING_G_PER_H = 60;

/** With fructose alongside, oxidation rises to ~1.5 g/min. */
export const MULTI_TRANSPORTABLE_CEILING_G_PER_H = 90;

/**
 * The trained upper end. Only reachable with deliberate gut training, and only
 * offered when the athlete's own logs show they tolerate the rate below it.
 */
export const GUT_TRAINED_CEILING_G_PER_H = 110;

/**
 * What a set of products can deliver per hour.
 *
 * `gutTrainedTo` is the highest rate the athlete has actually tolerated (from
 * their own logs). It can only ever *raise* the ceiling above the population
 * default when the mix supports it — no amount of training defeats SGLT1
 * saturation on glucose alone.
 */
export function absorptionCeiling(sources: CarbSources, gutTrainedTo?: number): AbsorptionCeiling {
  const total = sources.glucoseG + sources.fructoseG;
  if (total <= 0) {
    return { ceilingG: 0, multiTransportable: false, reason: "No carbohydrate in the plan." };
  }
  if (sources.fructoseG <= 0) {
    return {
      ceilingG: GLUCOSE_ONLY_CEILING_G_PER_H,
      multiTransportable: false,
      reason: "Glucose only — one intestinal transporter, which saturates near 60 g/h.",
    };
  }

  const ratio = Math.round((sources.glucoseG / sources.fructoseG) * 10) / 10;
  // A token amount of fructose does not open the second route. Useful ratios sit
  // between about 1:1 and 3:1; outside that the mix behaves closer to glucose alone.
  const useful = ratio >= 0.8 && ratio <= 3.2;
  if (!useful) {
    return {
      ceilingG: GLUCOSE_ONLY_CEILING_G_PER_H,
      ratio,
      multiTransportable: false,
      reason: `At ${ratio}:1 there is too little of the second sugar to add a transport route.`,
    };
  }

  const base = MULTI_TRANSPORTABLE_CEILING_G_PER_H;
  // Gut training is evidence, not a wish: it only lifts the ceiling as far as a
  // rate the athlete has already tolerated, and never past the trained maximum.
  const trained = gutTrainedTo !== undefined ? Math.min(GUT_TRAINED_CEILING_G_PER_H, Math.max(base, gutTrainedTo)) : base;
  return {
    ceilingG: trained,
    ratio,
    multiTransportable: true,
    reason:
      trained > base
        ? `Glucose + fructose at ${ratio}:1, and you have already tolerated ${gutTrainedTo} g/h.`
        : `Glucose + fructose at ${ratio}:1 opens a second transport route (~90 g/h).`,
  };
}

/**
 * Split a product's carbohydrate into the two transport routes.
 *
 * The catalog does not carry a sugar breakdown for every product, so this reads
 * the flag the nutritionist *does* set: `multiTransportable` means the label
 * declares a 2:1-style blend. Products without it are treated as glucose-type,
 * which is the safe assumption — under-promising the ceiling costs a little
 * performance, over-promising costs the race.
 */
export function productCarbSources(product: Product, servings: number): CarbSources {
  const carbs = product.carbsG * servings;
  if (carbs <= 0) return { glucoseG: 0, fructoseG: 0 };
  if (product.multiTransportable) {
    // A declared 2:1 blend: two thirds glucose, one third fructose.
    return { glucoseG: (carbs * 2) / 3, fructoseG: carbs / 3 };
  }
  return { glucoseG: carbs, fructoseG: 0 };
}

/** Add up the sources across everything the athlete is planning to take. */
export function sumCarbSources(parts: CarbSources[]): CarbSources {
  return parts.reduce(
    (acc, p) => ({ glucoseG: acc.glucoseG + p.glucoseG, fructoseG: acc.fructoseG + p.fructoseG }),
    { glucoseG: 0, fructoseG: 0 },
  );
}

export interface DeliverabilityCheck {
  /** What the plan asks for, g/h. */
  targetG: number;
  /** What the chosen products can actually deliver, g/h. */
  ceilingG: number;
  /** True when the target is within what the mix can absorb. */
  deliverable: boolean;
  /** The shortfall, g/h — zero when deliverable. */
  shortfallG: number;
  ceiling: AbsorptionCeiling;
  /** What to change, when it isn't deliverable. */
  fix?: string;
}

/**
 * Hold a carbohydrate target against what the chosen products can absorb.
 *
 * This is the check the platform was missing: it could recommend 90 g/h and a
 * bag of glucose gels in the same breath, and nothing noticed.
 */
export function checkDeliverable(
  targetPerHourG: number,
  sources: CarbSources,
  gutTrainedTo?: number,
): DeliverabilityCheck {
  const ceiling = absorptionCeiling(sources, gutTrainedTo);
  const deliverable = targetPerHourG <= ceiling.ceilingG;
  const shortfallG = deliverable ? 0 : Math.round(targetPerHourG - ceiling.ceilingG);
  return {
    targetG: Math.round(targetPerHourG),
    ceilingG: ceiling.ceilingG,
    deliverable,
    shortfallG,
    ceiling,
    ...(deliverable
      ? {}
      : {
          fix: ceiling.multiTransportable
            ? `Above what any gut absorbs reliably — plan ${ceiling.ceilingG} g/h and make up the rest before and after.`
            : "Swap part of the plan for a glucose + fructose (2:1) product, which lifts the ceiling to about 90 g/h.",
        }),
  };
}

/**
 * Fraction of energy coming from carbohydrate at a given effort.
 *
 * The classic crossover: at easy intensities fat covers most of the cost and
 * glycogen lasts; as intensity rises, carbohydrate takes over almost completely.
 * Anchored on Brooks & Mercier's crossover concept — ~45 % of energy from
 * carbohydrate at low intensity, ~85 % at threshold, ~95 % above it.
 */
export function carbEnergyFraction(intensity: Intensity): number {
  switch (intensity) {
    case "easy":
      return 0.45;
    case "moderate":
      return 0.7;
    case "hard":
      return 0.85;
    case "race":
      return 0.9;
  }
}

/**
 * Carbohydrate burned per hour, from intensity and body mass.
 *
 * Energy cost is taken from a metabolic-equivalent style estimate (kcal/h ≈ MET ×
 * kg), then multiplied by the carbohydrate share of that energy and divided by
 * 4 kcal/g. This replaces a lookup table with something that actually moves when
 * the athlete's weight or effort changes — a 55 kg runner and a 90 kg runner no
 * longer burn the same.
 */
export function carbBurnPerHourG(bodyWeightKg: number, intensity: Intensity): number {
  const MET: Record<Intensity, number> = { easy: 7, moderate: 10.5, hard: 13.5, race: 15.5 };
  const kcalPerHour = MET[intensity] * bodyWeightKg;
  return Math.round((kcalPerHour * carbEnergyFraction(intensity)) / 4);
}
