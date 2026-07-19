/**
 * Types mirroring the platform API (src/api/handlers.ts on the server). Kept
 * minimal and self-contained so the app builds independently; the server is the
 * source of truth for the actual computation, keeping web and mobile in sync.
 */

export type Goal =
  | "general-fitness"
  | "endurance-performance"
  | "race-preparation"
  | "weight-loss"
  | "recovery-focus";

export type Activity = "running" | "trail-running" | "cycling" | "triathlon" | "swimming";
export type Intensity = "easy" | "moderate" | "hard" | "race";

export interface AthleteInput {
  goal: Goal;
  activity: Activity;
  durationMin: number;
  intensity: Intensity;
  bodyWeightKg: number;
  caffeineOk?: boolean;
}

export interface FuelingTarget {
  carbPerHourG: number;
  carbTotalG: number;
  fluidPerHourMl: number;
  sodiumPerLitreMg: number;
  hydrationSource: "measured" | "estimated";
  sodiumSource: "measured" | "estimated";
}

export interface PhasePlan {
  phase: "pre" | "during" | "post";
  headline: string;
  detail: string;
  products: { id: string; brand: string; name: string; servingLabel: string }[];
}

export interface Recommendation {
  target: FuelingTarget;
  phases: PhasePlan[];
  notes: string[];
}

export interface FuelingCue {
  atMin: number;
  kind: "start" | "carb" | "drink" | "caffeine" | "finish";
  label: string;
  sodiumMg?: number;
}

export interface FuelingSchedule {
  totalMin: number;
  cues: FuelingCue[];
  totalCarbG: number;
  totalFluidMl: number;
}

export type GiRating = "none" | "mild" | "severe";
export type EnergyRating = "bonked" | "faded" | "steady" | "strong";

export interface SessionFeedback {
  id: string;
  date: string;
  durationMin: number;
  plannedCarbPerHourG: number;
  gi: GiRating;
  energy: EnergyRating;
}

export interface AdaptationInsight {
  carbCeilingG?: number;
  carbBiasG?: number;
  confidence: "none" | "low" | "medium" | "high";
  rationale: string[];
  samples: number;
}
