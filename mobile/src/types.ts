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

/** Athlete body & health profile — mirrors the platform's ProfileStore. */
export interface AthleteProfile {
  bodyWeightKg: number;
  sweatLevel: "light" | "average" | "heavy";
  caffeineOk: boolean;
  useSignals: boolean;
  sweatRateMlPerH: number;
  sweatSodiumMgPerL: number;
  readiness: number;
  syncedFrom?: string;
}

export interface Product {
  id: string;
  name: string;
  brand: string;
  category: "drink-mix" | "gel" | "bar" | "electrolyte" | "recovery";
  phases: ("pre" | "during" | "post")[];
  carbsG: number;
  sodiumMg: number;
  caffeineMg?: number;
  proteinG?: number;
  multiTransportable?: boolean;
  servingLabel: string;
  priceChf?: number;
  shopUrl?: string;
  custom?: boolean;
  notes?: string;
}

/** When a product is the right choice — derived server-side from its attributes. */
export interface UsageGuide {
  summary: string;
  bestWhen: string[];
  avoidWhen: string[];
}

export interface ProviderConnection {
  provider: string;
  athleteId?: string;
  connectedAt: string;
}

export interface CartLine {
  productId: string;
  name: string;
  brand: string;
  qty: number;
  unitPriceChf: number;
  lineTotalChf: number;
}

export interface Order {
  id: string;
  kind: "products" | "subscription";
  status: "pending" | "paid" | "failed" | "cancelled";
  amountChf: number;
  createdAt: string;
}

export interface Milestone {
  id: string;
  name: string;
  description: string;
  category: string;
  done: boolean;
}

export interface ScoreComponent {
  id: string;
  label: string;
  score: number;
  weight: number;
  detail: string;
}

export interface FuellingScore {
  score: number | null;
  band: "getting-started" | "building" | "solid" | "dialled-in";
  components: ScoreComponent[];
  nextActions: { title: string; why: string }[];
  healthFlags: string[];
  trend: { direction: "up" | "flat" | "down"; delta: number } | null;
  sessionsLogged: number;
}

export interface InsightsResponse {
  progress: {
    streakDays: number;
    longestStreakDays: number;
    doneCount: number;
    milestones: Milestone[];
    stats: { activities: number; hours: number; distanceKm: number; elevationM: number; longSessions: number; loggedSessions: number };
  };
  fuelling: FuellingScore;
  hasData: boolean;
}

export interface GuideArticle {
  id: string;
  category: string;
  title: string;
  summary: string;
  keyNumbers: { label: string; value: string }[];
  body: string[];
  practice: string[];
  pitfalls: string[];
  evidence: string;
  readMinutes: number;
}
