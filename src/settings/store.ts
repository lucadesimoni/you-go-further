import type { ProviderId } from "../model";
import { ALL_PROVIDER_IDS } from "../providers";
import type { Tier } from "../subscription";
import type { AppConfig } from "../config";
import { normalizeProgram, type PartnerProgram } from "../commerce/affiliate";

/**
 * Platform settings an admin can change at **runtime** — the operational knobs
 * that don't need a redeploy. Boot values come from {@link AppConfig} (env /
 * window config); the admin area overlays and persists changes here. Secrets and
 * infrastructure choices (store backend, DB url, OAuth secrets) stay env-only and
 * are deliberately *not* editable from the UI.
 */
export interface PlatformSettings {
  /** Which activity providers athletes may connect. */
  enabledProviders: ProviderId[];
  /** Tier assigned to a newly-registered account. */
  defaultTier: Tier;
  /** Whether the in-app demo role switcher is allowed. */
  allowRoleSwitching: boolean;
  /** Whether the analytics export sink (Databricks etc.) is on. */
  exportEnabled: boolean;
  /** Whether new users may self-register. */
  registrationOpen: boolean;
  /** Freeze the platform for maintenance (banner + read-only). */
  maintenanceMode: boolean;
  /**
   * Affiliate partner programs, keyed by brand.
   *
   * Empty by default and on purpose: we ship no invented publisher ids. Until a
   * brand agreement is signed the athlete still gets a link to that brand's
   * shop, it simply carries no tracking — and the UI says so.
   */
  partners: PartnerProgram[];
}

export interface SettingsStore {
  get(): Promise<PlatformSettings>;
  update(patch: Partial<PlatformSettings>): Promise<PlatformSettings>;
}

/** Build the default settings from the resolved app config. */
export function defaultSettings(config: AppConfig): PlatformSettings {
  return {
    enabledProviders: [...config.enabledProviders],
    defaultTier: config.defaultTier,
    allowRoleSwitching: config.allowRoleSwitching,
    exportEnabled: config.exportEnabled,
    registrationOpen: true,
    maintenanceMode: false,
    partners: [],
  };
}

const TIERS: Tier[] = ["free", "pro", "elite"];

/** Validate an admin settings patch, keeping only recognized values. */
export function normalizeSettingsPatch(input: Partial<PlatformSettings>): Partial<PlatformSettings> {
  const out: Partial<PlatformSettings> = {};
  if (Array.isArray(input.enabledProviders)) {
    out.enabledProviders = input.enabledProviders.filter((p): p is ProviderId =>
      (ALL_PROVIDER_IDS as string[]).includes(p),
    );
  }
  if (input.defaultTier && TIERS.includes(input.defaultTier)) out.defaultTier = input.defaultTier;
  for (const k of ["allowRoleSwitching", "exportEnabled", "registrationOpen", "maintenanceMode"] as const) {
    if (typeof input[k] === "boolean") out[k] = input[k];
  }
  if (Array.isArray(input.partners)) {
    // One program per brand, and nothing unusable: a bad URL here would become
    // an outbound link from our own UI.
    const seen = new Set<string>();
    out.partners = input.partners
      .map(normalizeProgram)
      .filter((p): p is PartnerProgram => p !== null)
      .filter((p) => {
        const key = p.brand.toLowerCase();
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .slice(0, 50);
  }
  return out;
}

export class InMemorySettingsStore implements SettingsStore {
  private settings: PlatformSettings;

  constructor(initial: PlatformSettings) {
    this.settings = initial;
  }

  async get(): Promise<PlatformSettings> {
    return this.settings;
  }

  async update(patch: Partial<PlatformSettings>): Promise<PlatformSettings> {
    this.settings = { ...this.settings, ...normalizeSettingsPatch(patch) };
    return this.settings;
  }
}
