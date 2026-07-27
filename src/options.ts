import type { Activity, Conditions, Goal, Intensity, SweatLevel } from "./engine";
import type { TranslationKey } from "./i18n/en";

/**
 * The option lists behind every picker.
 *
 * Each entry carries a translation *key* rather than a finished string, so the
 * same list serves both languages and nothing has to be duplicated per locale.
 * `label` stays as the English fallback for the few non-React call sites.
 */
export const GOALS: { value: Goal; label: string; blurb: string; labelKey: TranslationKey; blurbKey: TranslationKey }[] = [
  { value: "general-fitness", label: "General fitness", blurb: "Stay healthy and train comfortably", labelKey: "goal.general-fitness", blurbKey: "goal.general-fitness.blurb" },
  { value: "endurance-performance", label: "Endurance performance", blurb: "Go longer and faster", labelKey: "goal.endurance-performance", blurbKey: "goal.endurance-performance.blurb" },
  { value: "race-preparation", label: "Race preparation", blurb: "Dial in and rehearse race-day fueling", labelKey: "goal.race-preparation", blurbKey: "goal.race-preparation.blurb" },
  { value: "weight-loss", label: "Weight loss", blurb: "Lose fat while protecting hard sessions", labelKey: "goal.weight-loss", blurbKey: "goal.weight-loss.blurb" },
  { value: "recovery-focus", label: "Recovery focus", blurb: "Bounce back between sessions", labelKey: "goal.recovery-focus", blurbKey: "goal.recovery-focus.blurb" },
];

export const ACTIVITIES: { value: Activity; label: string; labelKey: TranslationKey }[] = [
  { value: "running", label: "Running", labelKey: "activity.running" },
  { value: "trail-running", label: "Trail running", labelKey: "activity.trail-running" },
  { value: "cycling", label: "Cycling", labelKey: "activity.cycling" },
  { value: "triathlon", label: "Triathlon", labelKey: "activity.triathlon" },
  { value: "swimming", label: "Swimming", labelKey: "activity.swimming" },
];

export const INTENSITIES: { value: Intensity; label: string; labelKey: TranslationKey }[] = [
  { value: "easy", label: "Easy", labelKey: "intensity.easy" },
  { value: "moderate", label: "Moderate", labelKey: "intensity.moderate" },
  { value: "hard", label: "Hard", labelKey: "intensity.hard" },
  { value: "race", label: "Race", labelKey: "intensity.race" },
];

export const CONDITIONS: { value: Conditions; label: string; labelKey: TranslationKey }[] = [
  { value: "cool", label: "Cool", labelKey: "conditions.cool" },
  { value: "temperate", label: "Temperate", labelKey: "conditions.temperate" },
  { value: "hot", label: "Hot", labelKey: "conditions.hot" },
];

export const SWEAT_LEVELS: { value: SweatLevel; label: string; labelKey: TranslationKey }[] = [
  { value: "light", label: "Light", labelKey: "sweat.light" },
  { value: "average", label: "Average", labelKey: "sweat.average" },
  { value: "heavy", label: "Heavy", labelKey: "sweat.heavy" },
];

/** Phase labels as translation keys, for React call sites. */
export const PHASE_KEYS: Record<"pre" | "during" | "post", TranslationKey> = {
  pre: "plan.phasePre",
  during: "plan.phaseDuring",
  post: "plan.phasePost",
};

/** Sweat descriptions used in the "tuned to…" line. */
export const SWEAT_TEXT_KEYS: Record<SweatLevel, TranslationKey> = {
  light: "sweat.lightText",
  average: "sweat.averageText",
  heavy: "sweat.heavyText",
};

