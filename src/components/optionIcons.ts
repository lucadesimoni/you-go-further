import type { Activity, Conditions, Goal, SweatLevel } from "../engine";
import type { EventDiscipline } from "../events";
import type { IconName } from "./Icon";

/**
 * Which glyph stands for which option.
 *
 * Deliberately kept out of `src/options.ts`: that file is the data behind every
 * picker and is read by non-React call sites, and a drawing is not data. Here
 * the mapping sits beside the icon set it names, so adding a sport means
 * touching the sport list and this file and nothing else.
 */
export const GOAL_ICONS: Record<Goal, IconName> = {
  "general-fitness": "heart",
  "endurance-performance": "trend",
  "race-preparation": "race",
  "weight-loss": "scale",
  "recovery-focus": "moon",
};

export const ACTIVITY_ICONS: Record<Activity, IconName> = {
  running: "run",
  "trail-running": "trail",
  cycling: "bike",
  triathlon: "triathlon",
  swimming: "swim",
};

export const CONDITION_ICONS: Record<Conditions, IconName> = {
  cool: "cold",
  temperate: "mild",
  hot: "hot",
};

export const DISCIPLINE_ICONS: Record<EventDiscipline, IconName> = {
  "road-run": "run",
  "trail-run": "trail",
  "ultra-trail": "trail",
  triathlon: "triathlon",
  cycling: "bike",
};

export const SWEAT_ICONS: Record<SweatLevel, IconName> = {
  light: "drop1",
  average: "drop2",
  heavy: "drop3",
};
