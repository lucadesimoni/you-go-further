import type { ProviderId } from "../model";
import type { SweatLevel } from "../engine";
import { generateSampleWellness } from "../providers";
import { derivePhysiology, estimateSweatRateMlPerH } from "../analysis";

/**
 * Sync body signals from the athlete's main health platform. Real integrations
 * use each platform's API/SDK — Garmin & Suunto via the OAuth connectors already
 * in the app; Apple Health & Google Health via the native mobile SDKs. In the
 * web/demo build this derives representative signals from sampled wellness so the
 * flow is fully runnable; a connected account replaces the sample with live data.
 */
export interface HealthPlatform {
  id: string;
  label: string;
  /** Provider used as the wellness sample source in the demo build. */
  sample: ProviderId;
}

export const HEALTH_PLATFORMS: HealthPlatform[] = [
  { id: "garmin", label: "Garmin", sample: "garmin" },
  { id: "suunto", label: "Suunto", sample: "suunto" },
  { id: "apple-health", label: "Apple Health", sample: "polar" },
  { id: "google-health", label: "Google Health", sample: "garmin" },
];

export interface SyncedSignals {
  sweatRateMlPerH: number;
  sweatSodiumMgPerL: number;
  readiness: number;
}

/** Pull readiness (measured) + sensible sweat estimates for the given platform. */
export function syncHealthSignals(
  platform: HealthPlatform,
  bodyWeightKg: number,
  sweatLevel: SweatLevel,
): SyncedSignals {
  const phys = derivePhysiology(generateSampleWellness(platform.sample, 28));
  return {
    readiness: phys.readiness ?? 65,
    sweatRateMlPerH: estimateSweatRateMlPerH(bodyWeightKg, "moderate", "temperate"),
    sweatSodiumMgPerL: sweatLevel === "heavy" ? 1000 : sweatLevel === "light" ? 500 : 800,
  };
}
