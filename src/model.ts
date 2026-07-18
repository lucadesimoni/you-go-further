/**
 * Shared, provider-neutral domain model.
 *
 * Every connector (Strava, Garmin, Polar, Suunto, …) normalizes its raw payload
 * into an {@link Activity}. Analysis, storage, and the nutrition engine all work
 * against this one shape, so adding a provider never touches downstream code.
 */

export type ProviderId = "strava" | "garmin" | "polar" | "suunto";

export type SportType =
  | "run"
  | "trail-run"
  | "ride"
  | "swim"
  | "triathlon"
  | "other";

/** A single training session, normalized across providers. */
export interface Activity {
  /** Stable id within our system: `${provider}:${externalId}`. */
  id: string;
  provider: ProviderId;
  /** The provider's own id for this activity, used for de-duplication. */
  externalId: string;
  sport: SportType;
  /** ISO-8601 start timestamp. */
  startTime: string;
  durationSec: number;
  distanceM?: number;
  elevationGainM?: number;
  avgHr?: number;
  maxHr?: number;
  avgPowerW?: number;
  calories?: number;
  /** Provider-computed training load, if available (e.g. Garmin/Polar/Suunto). */
  trainingLoad?: number;
  name?: string;
}

/** What we know about the athlete, independent of any single session. */
export interface AthleteProfile {
  bodyWeightKg: number;
  maxHr?: number;
  restHr?: number;
}

export const SPORT_LABELS: Record<SportType, string> = {
  run: "Run",
  "trail-run": "Trail run",
  ride: "Ride",
  swim: "Swim",
  triathlon: "Triathlon",
  other: "Other",
};

/** Whole hours of a duration in seconds. */
export const toHours = (durationSec: number) => durationSec / 3600;
