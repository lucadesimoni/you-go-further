/**
 * Domain types for the endurance nutrition recommendation engine.
 *
 * The engine is framework-agnostic: it takes an {@link AthleteInput} and returns
 * a {@link Recommendation}. It is imported by the web UI but has no dependency on
 * React or the DOM, so it can also run in Node, tests, or an edge function.
 */

/** What the athlete is training for. Drives fueling aggressiveness and emphasis. */
export type Goal =
  | "general-fitness"
  | "endurance-performance"
  | "race-preparation"
  | "weight-loss"
  | "recovery-focus";

/** The type of endurance session. Affects carbohydrate cost and hydration. */
export type Activity = "running" | "cycling" | "triathlon" | "trail-running" | "swimming";

/** Perceived effort of the session. Maps loosely to % of threshold. */
export type Intensity = "easy" | "moderate" | "hard" | "race";

/** Ambient conditions — mainly a hydration and sodium modifier. */
export type Conditions = "cool" | "temperate" | "hot";

/** How much the athlete sweats. Scales fluid and sodium targets. */
export type SweatLevel = "light" | "average" | "heavy";

export interface AthleteInput {
  goal: Goal;
  activity: Activity;
  /** Planned session duration in minutes. */
  durationMin: number;
  intensity: Intensity;
  /** Body mass in kilograms. Used for pre/post carb and protein dosing. */
  bodyWeightKg: number;
  conditions?: Conditions;
  sweatLevel?: SweatLevel;
  /** Whether the athlete tolerates caffeine and wants it suggested. */
  caffeineOk?: boolean;
  /** Measured body signals from connected devices — used to personalize. */
  physiology?: PhysiologySignals;
  /** Learned adjustments from the athlete's own session feedback. */
  adaptation?: Adaptation;
}

/**
 * Adjustments the system has *learned* from logged session outcomes (gut
 * tolerance, bonking). Produced by `src/feedback`, applied to the carb target.
 */
export interface Adaptation {
  /** Hard cap on carb/h derived from GI-distress logs. */
  carbCeilingG?: number;
  /** Signed nudge to carb/h (e.g. +8 after repeated low-energy sessions). */
  carbBiasG?: number;
}

/**
 * Individualized body signals sourced from wearables / sweat testing. When
 * present these move the plan off population buckets and onto *this* athlete.
 */
export interface PhysiologySignals {
  /** Measured sweat rate (ml/h) from a sweat test or device estimate. */
  sweatRateMlPerH?: number;
  /** Measured sweat sodium concentration (mg/L). */
  sweatSodiumMgPerL?: number;
  /** Training readiness 0–100 (Garmin / Polar / Suunto). */
  readiness?: number;
  /** Latest overnight HRV (ms) and the athlete's rolling baseline. */
  hrvMs?: number;
  hrvBaselineMs?: number;
}

/** Whether a target was computed from measured data or a population estimate. */
export type Provenance = "measured" | "estimated";

/** Which part of the session a product or guideline applies to. */
export type Phase = "pre" | "during" | "post";

export type ProductCategory =
  | "drink-mix"
  | "gel"
  | "bar"
  | "electrolyte"
  | "recovery";

export interface Product {
  id: string;
  name: string;
  /** Swiss sports-nutrition brand. */
  brand: string;
  category: ProductCategory;
  /** Session phases this product fits. */
  phases: Phase[];
  /** Carbohydrate grams per serving. */
  carbsG: number;
  /** Sodium milligrams per serving. */
  sodiumMg: number;
  /** Caffeine milligrams per serving, if any. */
  caffeineMg?: number;
  /** Protein grams per serving, if any. */
  proteinG?: number;
  /**
   * Uses multiple transportable carbohydrates (glucose + fructose), which lets
   * the gut absorb well beyond ~60 g/h. Required for high during-session targets.
   */
  multiTransportable?: boolean;
  servingLabel: string;
  /** Retail price per serving/unit in CHF (approximate). */
  priceChf?: number;
  notes?: string;
}

export interface FuelingTarget {
  /** Carbohydrate grams per hour to consume during the session. */
  carbPerHourG: number;
  /** Total carbohydrate grams across the session. */
  carbTotalG: number;
  /** Fluid millilitres per hour. */
  fluidPerHourMl: number;
  /** Sodium milligrams per litre of fluid. */
  sodiumPerLitreMg: number;
  /** Whether multiple transportable carbohydrates are required to hit the target. */
  requiresMultiTransportable: boolean;
  /** Whether the fluid target came from measured sweat rate or an estimate. */
  hydrationSource: Provenance;
  /** Whether the sodium target came from a measured sweat test or an estimate. */
  sodiumSource: Provenance;
}

export interface PhasePlan {
  phase: Phase;
  headline: string;
  detail: string;
  /** Recommended products for this phase, best match first. */
  products: Product[];
}

export interface Recommendation {
  input: AthleteInput;
  target: FuelingTarget;
  phases: PhasePlan[];
  /** Human-readable notes, caveats, and goal-specific guidance. */
  notes: string[];
}
