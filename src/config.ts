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
import { PLATFORM_VERSION } from "./version";

export type StoreBackend = "memory" | "file" | "postgres" | "warehouse";

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
  /** Directory for the file store backend. */
  dataDir: string;
  /** Postgres connection string (server-only; never sent to the client). */
  databaseUrl?: string;
  enabledProviders: ProviderId[];
  /** Stream normalised activities to an export sink. */
  exportEnabled: boolean;
  defaultTier: Tier;
  /** Allow the in-app role/tier switcher (demo & staging; off in prod). */
  allowRoleSwitching: boolean;
  /**
   * Sell subscriptions. Off for the Phase-1 Swiss launch — the app is free and
   * earns through affiliate commission — which serves every athlete the full
   * feature set and hides the billing screens.
   */
  subscriptionsEnabled: boolean;
  /**
   * Sell products ourselves instead of handing off to partner shops. Off for
   * Phase 1: no stock, no fulfilment, no returns — the brands ship, and pay
   * commission. The direct-sale cart stays in the code for B2B and a house brand.
   */
  sellDirect: boolean;
  /** Public OAuth client ids for real social sign-in (empty = simulated). */
  googleClientId: string;
  appleClientId: string;
  /**
   * Who operates this deployment, shown on the privacy screen.
   *
   * Not decoration: Swiss law requires a business offering a service online to
   * identify itself, and both the revised FADP and the GDPR require a named
   * controller and a contact for data-protection requests. This app cannot
   * know them — they belong to whoever runs it — so they are configuration,
   * and `npm run preflight` refuses a production deployment that leaves them
   * empty rather than letting the screen ship with a placeholder.
   */
  operatorName: string;
  operatorAddress: string;
  privacyContact: string;
  termsUrl: string;
  version: string;
}

interface RawConfig {
  environment?: string;
  basePath?: string;
  apiBaseUrl?: string;
  storeBackend?: string;
  warehouseUrl?: string;
  dataDir?: string;
  databaseUrl?: string;
  enabledProviders?: string;
  exportEnabled?: string | boolean;
  defaultTier?: string;
  allowRoleSwitching?: string | boolean;
  subscriptionsEnabled?: string | boolean;
  sellDirect?: string | boolean;
  googleClientId?: string;
  appleClientId?: string;
  operatorName?: string;
  operatorAddress?: string;
  privacyContact?: string;
  termsUrl?: string;
  version?: string;
}

const DEFAULTS: AppConfig = {
  environment: "development",
  basePath: "/",
  apiBaseUrl: "",
  storeBackend: "memory",
  dataDir: "./.data",
  enabledProviders: [...ALL_PROVIDER_IDS],
  exportEnabled: false,
  defaultTier: "free",
  allowRoleSwitching: true,
  subscriptionsEnabled: false,
  sellDirect: false,
  googleClientId: "",
  appleClientId: "",
  operatorName: "",
  operatorAddress: "",
  privacyContact: "",
  termsUrl: "",
  version: PLATFORM_VERSION,
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
    dataDir: get("DATA_DIR"),
    databaseUrl: proc["DATABASE_URL"], // server-only secret; never via VITE_
    enabledProviders: get("ENABLED_PROVIDERS"),
    exportEnabled: get("EXPORT_ENABLED"),
    defaultTier: get("DEFAULT_TIER"),
    allowRoleSwitching: get("ALLOW_ROLE_SWITCHING"),
    subscriptionsEnabled: get("SUBSCRIPTIONS_ENABLED"),
    sellDirect: get("SELL_DIRECT"),
    googleClientId: get("GOOGLE_CLIENT_ID"),
    appleClientId: get("APPLE_CLIENT_ID"),
    operatorName: get("OPERATOR_NAME"),
    operatorAddress: get("OPERATOR_ADDRESS"),
    privacyContact: get("PRIVACY_CONTACT"),
    termsUrl: get("TERMS_URL"),
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
  const backends: StoreBackend[] = ["memory", "file", "postgres", "warehouse"];
  // A DATABASE_URL implies Postgres unless explicitly overridden.
  const requested = (raw.storeBackend as StoreBackend) || (raw.databaseUrl ? "postgres" : undefined);
  const store: StoreBackend = requested && backends.includes(requested) ? requested : "memory";
  return {
    environment: raw.environment || DEFAULTS.environment,
    basePath: raw.basePath || DEFAULTS.basePath,
    apiBaseUrl: raw.apiBaseUrl || DEFAULTS.apiBaseUrl,
    storeBackend: store,
    warehouseUrl: raw.warehouseUrl,
    dataDir: raw.dataDir || DEFAULTS.dataDir,
    databaseUrl: raw.databaseUrl,
    enabledProviders: parseProviders(raw.enabledProviders) ?? DEFAULTS.enabledProviders,
    exportEnabled: asBool(raw.exportEnabled, DEFAULTS.exportEnabled),
    defaultTier: tier,
    allowRoleSwitching: asBool(raw.allowRoleSwitching, DEFAULTS.allowRoleSwitching),
    subscriptionsEnabled: asBool(raw.subscriptionsEnabled, DEFAULTS.subscriptionsEnabled),
    sellDirect: asBool(raw.sellDirect, DEFAULTS.sellDirect),
    googleClientId: raw.googleClientId || DEFAULTS.googleClientId,
    appleClientId: raw.appleClientId || DEFAULTS.appleClientId,
    operatorName: raw.operatorName || DEFAULTS.operatorName,
    // A postal address has lines. An env file cannot hold a real newline, so
    // `\n` written in one becomes one here rather than showing up as literal
    // backslash-n on the privacy screen.
    operatorAddress: (raw.operatorAddress || DEFAULTS.operatorAddress).replace(/\\n/g, "\n"),
    privacyContact: raw.privacyContact || DEFAULTS.privacyContact,
    termsUrl: raw.termsUrl || DEFAULTS.termsUrl,
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
