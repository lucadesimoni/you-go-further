import type { Activity, Conditions, Goal, Intensity, SweatLevel } from "./engine";

/** Human-readable labels for the enum values, shared by the form and results. */
export const GOALS: { value: Goal; label: string; blurb: string }[] = [
  { value: "general-fitness", label: "General fitness", blurb: "Stay healthy and train comfortably" },
  { value: "endurance-performance", label: "Endurance performance", blurb: "Go longer and faster" },
  { value: "race-preparation", label: "Race preparation", blurb: "Dial in and rehearse race-day fueling" },
  { value: "weight-loss", label: "Weight loss", blurb: "Lose fat while protecting hard sessions" },
  { value: "recovery-focus", label: "Recovery focus", blurb: "Bounce back between sessions" },
];

export const ACTIVITIES: { value: Activity; label: string }[] = [
  { value: "running", label: "Running" },
  { value: "trail-running", label: "Trail running" },
  { value: "cycling", label: "Cycling" },
  { value: "triathlon", label: "Triathlon" },
  { value: "swimming", label: "Swimming" },
];

export const INTENSITIES: { value: Intensity; label: string }[] = [
  { value: "easy", label: "Easy" },
  { value: "moderate", label: "Moderate" },
  { value: "hard", label: "Hard" },
  { value: "race", label: "Race" },
];

export const CONDITIONS: { value: Conditions; label: string }[] = [
  { value: "cool", label: "Cool" },
  { value: "temperate", label: "Temperate" },
  { value: "hot", label: "Hot" },
];

export const SWEAT_LEVELS: { value: SweatLevel; label: string }[] = [
  { value: "light", label: "Light" },
  { value: "average", label: "Average" },
  { value: "heavy", label: "Heavy" },
];

export const PHASE_LABELS: Record<"pre" | "during" | "post", string> = {
  pre: "Before",
  during: "During",
  post: "After",
};
