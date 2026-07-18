/**
 * Runtime configuration — resolved once, from (in priority order):
 *   1. `window.__APP_CONFIG__` — injected at deploy time by `public/config.js`,
 *      so the *same* build runs in dev, staging, prod, and on-prem without a
 *      rebuild ("build once, run anywhere").
 *   2. `import.meta.env` / `process.env` — Vite build-time vars.
 *   3. Safe defaults.
 *
 * This is the single source of truth for which store backend, providers, export
 * sinks, and default tier the app wires up (see `src/runtime.ts`).
 */

import { ALL_PROVIDER_IDS } from "./providers";
import type { ProviderId } from "./model";
import type { Tier } from "./subscription";

export type StoreBackend = "memory" | "warehouse";

export interface AppConfig {
  /** Environment label, surfaced in the UI/health checks. */
  environment: string;
  /** Base path the SPA is served under (e.g. "/app"). */
  basePath: string;
  /** Optional REST API base; empty means "run fully client-side with mocks". */
  apiBaseUrl: string;
  storeBackend: StoreBackend;
  /** Connection string for the warehouse backend (never a secret in the client). */
  warehouseUrl?: string;
  enabledProviders: ProviderId[];
  /** Stream normalized activities to an export sink. */
  exportEnabled: boolean;
  defaultTier: Tier;
  /** Allow the in-app role/tier switcher (demo & staging; off in prod). */
  allowRoleSwitching: boolean;
  version: string;
}

interface RawConfig {
  environment?: string;
  basePath?: string;
  apiBaseUrl?: string;
  storeBackend?: string;
  warehouseUrl?: string;
  enabledProviders?: string;
  exportEnabled?: string | boolean;
  defaultTier?: string;
  allowRoleSwitching?: string | boolean;
  version?: string;
}

const DEFAULTS: AppConfig = {
  environment: "development",
  basePath: "/",
  apiBaseUrl: "",
  storeBackend: "memory",
  enabledProviders: [...ALL_PROVIDER_IDS],
  exportEnabled: false,
  defaultTier: "free",
  allowRoleSwitching: true,
  version: "0.2.0",
};

function readEnv(): RawConfig {
  // Vite exposes build-time vars on import.meta.env; Node has process.env.
  const meta = (typeof import.meta !== "undefined" ? (import.meta as { env?: Record<string, string> }).env : undefined) ?? {};
  const proc = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env ?? {};
  const get = (k: string) => meta[`VITE_${k}`] ?? proc[`VITE_${k}`] ?? proc[k];
  return {
    environment: get("APP_ENV"),
    basePath: get("BASE_PATH"),
    apiBaseUrl: get("API_BASE_URL"),
    storeBackend: get("STORE_BACKEND"),
    warehouseUrl: get("WAREHOUSE_URL"),
    enabledProviders: get("ENABLED_PROVIDERS"),
    exportEnabled: get("EXPORT_ENABLED"),
    defaultTier: get("DEFAULT_TIER"),
    allowRoleSwitching: get("ALLOW_ROLE_SWITCHING"),
    version: get("APP_VERSION"),
  };
}

function readWindow(): RawConfig {
  return (globalThis as { __APP_CONFIG__?: RawConfig }).__APP_CONFIG__ ?? {};
}

const asBool = (v: string | boolean | undefined, fallback: boolean): boolean =>
  v === undefined ? fallback : typeof v === "boolean" ? v : /^(1|true|yes|on)$/i.test(v);

function parseProviders(v: string | undefined): ProviderId[] | undefined {
  if (!v) return undefined;
  const set = new Set(ALL_PROVIDER_IDS as string[]);
  const picked = v
    .split(",")
    .map((s) => s.trim())
    .filter((s) => set.has(s)) as ProviderId[];
  return picked.length ? picked : undefined;
}

function resolve(): AppConfig {
  // window overrides env overrides defaults.
  const raw: RawConfig = { ...readEnv(), ...pruneUndefined(readWindow()) };
  const tier = (["free", "pro", "elite"] as const).find((t) => t === raw.defaultTier) ?? DEFAULTS.defaultTier;
  const store: StoreBackend = raw.storeBackend === "warehouse" ? "warehouse" : "memory";
  return {
    environment: raw.environment || DEFAULTS.environment,
    basePath: raw.basePath || DEFAULTS.basePath,
    apiBaseUrl: raw.apiBaseUrl || DEFAULTS.apiBaseUrl,
    storeBackend: store,
    warehouseUrl: raw.warehouseUrl,
    enabledProviders: parseProviders(raw.enabledProviders) ?? DEFAULTS.enabledProviders,
    exportEnabled: asBool(raw.exportEnabled, DEFAULTS.exportEnabled),
    defaultTier: tier,
    allowRoleSwitching: asBool(raw.allowRoleSwitching, DEFAULTS.allowRoleSwitching),
    version: raw.version || DEFAULTS.version,
  };
}

function pruneUndefined<T extends object>(obj: T): Partial<T> {
  return Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined)) as Partial<T>;
}

let cached: AppConfig | null = null;

/** The resolved application configuration (memoized). */
export function getConfig(): AppConfig {
  return (cached ??= resolve());
}

/** Test/SSR helper: override or reset the cached config. */
export function __setConfigForTests(config: Partial<AppConfig> | null): void {
  cached = config ? { ...resolve(), ...config } : null;
}
