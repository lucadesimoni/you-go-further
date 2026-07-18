import type { Adaptation } from "../engine";

/**
 * Session feedback → learned adaptation. This is the loop that makes the product
 * improve *per athlete*: the athlete logs how a session actually went (gut
 * distress, energy), and future carb targets are tuned to what their body
 * tolerates and needs — something a device maker or a product brand doesn't do.
 */

export type GiRating = "none" | "mild" | "severe";
export type EnergyRating = "bonked" | "faded" | "steady" | "strong";

export interface SessionFeedback {
  id: string;
  /** ISO timestamp. */
  date: string;
  durationMin: number;
  /** The carb/h the plan recommended for that session. */
  plannedCarbPerHourG: number;
  /** What the athlete actually took, if known. */
  actualCarbPerHourG?: number;
  gi: GiRating;
  energy: EnergyRating;
  note?: string;
}

export interface AdaptationInsight extends Adaptation {
  confidence: "none" | "low" | "medium" | "high";
  rationale: string[];
  samples: number;
}

const rateOf = (f: SessionFeedback) => f.actualCarbPerHourG ?? f.plannedCarbPerHourG;

/**
 * Derive a carbohydrate ceiling and bias from recent feedback.
 * - Repeated GI distress lowers the ceiling below the rate that caused it.
 * - Bonking/fading with a settled gut nudges the target up.
 */
export function deriveAdaptation(feedbacks: SessionFeedback[]): AdaptationInsight {
  const recent = [...feedbacks].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 8);
  const rationale: string[] = [];
  if (recent.length === 0) {
    return { carbBiasG: 0, confidence: "none", rationale: ["No sessions logged yet."], samples: 0 };
  }

  const severe = recent.filter((f) => f.gi === "severe");
  const mild = recent.filter((f) => f.gi === "mild");
  const lowEnergy = recent.filter((f) => f.energy === "bonked" || f.energy === "faded");
  const cleanGut = severe.length === 0 && mild.length <= 1;

  let carbCeilingG: number | undefined;
  if (severe.length > 0) {
    const trigger = Math.min(...severe.map(rateOf));
    carbCeilingG = Math.max(30, Math.round((trigger - 10) / 5) * 5);
    rationale.push(`GI distress at ~${trigger} g/h in ${severe.length} session(s) → ceiling ${carbCeilingG} g/h.`);
  } else if (mild.length >= 2) {
    const trigger = Math.min(...mild.map(rateOf));
    carbCeilingG = Math.max(40, Math.round(trigger / 5) * 5);
    rationale.push(`Mild GI at ~${trigger} g/h more than once → soft ceiling ${carbCeilingG} g/h.`);
  }

  let carbBiasG = 0;
  if (cleanGut && lowEnergy.length >= 2) {
    carbBiasG = 8;
    rationale.push(`${lowEnergy.length} low-energy sessions with a settled gut → +${carbBiasG} g/h.`);
  } else if (cleanGut && recent.filter((f) => f.energy === "strong").length >= 3) {
    rationale.push("Gut is settled and energy is strong — room to build carbs further (gut training).");
  }

  if (rationale.length === 0) rationale.push("Feedback is neutral so far — keeping targets as-is.");

  const confidence = recent.length >= 5 ? "high" : recent.length >= 3 ? "medium" : "low";
  return { carbCeilingG, carbBiasG, confidence, rationale, samples: recent.length };
}

/** The subset the engine consumes. */
export function toAdaptation(insight: AdaptationInsight): Adaptation {
  return { carbCeilingG: insight.carbCeilingG, carbBiasG: insight.carbBiasG };
}
