/**
 * Version manifest — what this platform is, module by module.
 *
 * Two different questions need two different answers, so there are two kinds of
 * version here:
 *
 * - **`PLATFORM_VERSION`** identifies a *release* of You Go Further as a whole:
 *   the thing that gets deployed, reported by `GET /api/version`, and referred
 *   to in a bug report.
 * - **Each module carries its own version**, describing that module's *contract*
 *   — the exports other modules are allowed to depend on. `src/engine` can reach
 *   1.2.0 while `src/providers` is still at 0.6.0, and that difference is
 *   information: it says the engine's shape is settled and the connectors' is
 *   not.
 *
 * The rule for moving a module version:
 *
 * | Bump  | When |
 * | ----- | ---- |
 * | major | an export was removed or its meaning changed — callers must be edited |
 * | minor | a capability was added and everything that compiled before still does |
 * | patch | a fix or an internal change with no visible contract |
 *
 * `stability` is the honest label on top of the number:
 *
 * - `stable` — the contract is settled and backed by a real implementation.
 * - `evolving` — it works and is tested, but the shape is still moving.
 * - `preview` — the interface is real, part of the implementation is a
 *   documented stand-in (a mock connector, an unverified live payment path).
 *
 * A module may not be added to `src/` without an entry here: `version.test.ts`
 * walks the directory tree and fails if the two disagree. That is the point —
 * an undocumented, unversioned module is how a codebase stops being knowable.
 *
 * `docs/modules.md` is the prose companion to this file, and `docs/engine.md`
 * goes through the engine in detail.
 */

/** The release. See `CHANGELOG.md` for what changed between versions. */
export const PLATFORM_VERSION = "0.13.0";

/** Which broad layer a module belongs to — and therefore what it may import. */
export type ModuleLayer = "domain" | "platform" | "interface" | "surface";

export type ModuleStability = "stable" | "evolving" | "preview";

export interface ModuleVersion {
  /** Stable identifier, also the directory name under its root. */
  id: string;
  /** Repository-relative path. */
  path: string;
  version: string;
  layer: ModuleLayer;
  stability: ModuleStability;
  /** What this module is responsible for, in one line. */
  summary: string;
  /** The exports other modules are meant to use. */
  publicApi: readonly string[];
  /** Why it is not `stable`, when it is not. Empty otherwise. */
  caveat?: string;
}

/**
 * The layer rule, enforced by review rather than by tooling:
 *
 * - `domain` imports only other `domain` modules. No React, no `fetch`, no
 *   storage. This is what makes the engine runnable in a test, a browser, a
 *   Node server and an edge function without changing a line.
 * - `platform` may import `domain` and perform I/O.
 * - `interface` may import both, and is the only layer allowed to touch React
 *   or the DOM.
 * - `surface` is a deployable entry point rather than a library.
 */
export const MODULES: readonly ModuleVersion[] = [
  // ---- Domain: pure TypeScript, no I/O, no framework ----------------------
  {
    id: "engine",
    path: "src/engine",
    version: "1.3.0",
    layer: "domain",
    stability: "stable",
    summary:
      "The recommendation engine: fuelling targets, product selection, the timed schedule, terrain-aware stop placement, absorption ceilings, heat strain and the race simulation.",
    publicApi: [
      "computeTarget",
      "recommend",
      "buildSchedule",
      "planRouteFuelling",
      "absorptionCeiling",
      "checkDeliverable",
      "carbBurnPerHourG",
      "heatStrain",
      "heatIndexC",
      "simulateRace",
      "buildOffering",
      "productStore",
    ],
  },
  {
    id: "analysis",
    path: "src/analysis",
    version: "1.1.0",
    layer: "domain",
    stability: "stable",
    summary:
      "Reading a training history: weekly load, acute:chronic ratio, fitness/fatigue/form, session debriefs, and the anonymous cross-athlete cohort.",
    publicApi: ["analyzeActivities", "loadProfile", "loadFlags", "debriefSession", "summariseBands", "cohortPrior"],
  },
  {
    id: "progress",
    path: "src/progress",
    version: "1.0.0",
    layer: "domain",
    stability: "stable",
    summary: "The fuelling score and the milestones an athlete is working towards.",
    publicApi: ["fuellingScore", "progressSummary"],
  },
  {
    id: "feedback",
    path: "src/feedback",
    version: "1.0.0",
    layer: "domain",
    stability: "stable",
    summary:
      "Session logs and what the engine learns from them — a gut-tolerance ceiling and a carbohydrate bias, derived from what the athlete actually reported.",
    publicApi: ["deriveAdaptation", "feedbackStore"],
  },
  {
    id: "home",
    path: "src/home",
    version: "1.0.0",
    layer: "domain",
    stability: "stable",
    summary: "The start screen's summary: the last seven days, the next move, and what is still unreviewed.",
    publicApi: ["homeSummary"],
  },
  {
    id: "health",
    path: "src/health",
    version: "0.9.0",
    layer: "domain",
    stability: "preview",
    summary: "Normalising on-device health data (Apple Health, Health Connect) into sessions and body signals.",
    publicApi: ["ingestHealthSamples"],
    caveat:
      "The normalisation and validation are real and tested; the device read itself needs a physical phone, so CI drives it through a documented stand-in.",
  },
  {
    id: "subscription",
    path: "src/subscription",
    version: "1.0.0",
    layer: "domain",
    stability: "stable",
    summary: "Tiers and entitlements, and the switch that makes every tier free during Phase 1.",
    publicApi: ["effectiveTier", "planFor", "TIERS"],
  },
  {
    id: "data",
    path: "src/data",
    version: "1.0.0",
    layer: "domain",
    stability: "stable",
    summary: "The ingestion pipeline: registry, deduplication, concurrent ingest, the activity store and export.",
    publicApi: ["ingest", "activityStore", "exportActivities", "databricksSink"],
  },

  // ---- Platform: I/O, storage, network ------------------------------------
  {
    id: "geo",
    path: "src/geo",
    version: "1.2.0",
    layer: "platform",
    stability: "stable",
    summary:
      "Swiss terrain and weather: swisstopo elevation profiles and basemaps, MeteoSwiss stations with an ICON-CH fallback, and a tolerant GPX parser.",
    publicApi: ["enrichRoute", "elevationProfile", "fetchWeather", "parseGpx", "basemapLayers"],
    caveat:
      "Every remote source has a labelled offline fallback; the live responses cannot be exercised from a network-restricted environment.",
  },
  {
    id: "events",
    path: "src/events",
    version: "0.2.0",
    layer: "platform",
    stability: "evolving",
    summary:
      "Named races: a curated Swiss event list, the countdown phases that change what to eat, aid-station carry legs, and a race-day forecast that goes live as the date comes into model range.",
    publicApi: [
      "SWISS_EVENTS",
      "eventCountdown",
      "eventAdvice",
      "carryLegs",
      "planEvent",
      "fetchRaceDayWeather",
      "refreshEvent",
      "applyConfirmed",
    ],
    caveat:
      "A date is only confirmed once the refresh script has fetched it from the organiser; until then it is the traditional weekend, labelled approximate. Aid-station data is present only where an organiser publishes it plainly. The organiser hosts cannot be reached from a network-restricted environment, so `confirmed.ts` ships empty.",
  },
  {
    id: "training",
    path: "src/training",
    version: "0.2.0",
    layer: "domain",
    stability: "evolving",
    summary:
      "Periodised training plans for a named race: weekly volume built from the athlete's own recent hours, cut-back weeks, a taper, and carbohydrate-per-hour progressed alongside the training so race rate is rehearsed rather than met on the day.",
    publicApi: ["buildTrainingPlan", "sessionFuelling", "prepStats", "planLearnings", "recentWeeklyHours"],
    caveat:
      "A template built on mainstream endurance-coaching practice, not individual coaching. It knows the athlete's volume and the race, and nothing about their injuries, their job or their calendar.",
  },
  {
    id: "auth",
    path: "src/auth",
    version: "1.1.0",
    layer: "platform",
    stability: "stable",
    summary:
      "Sessions, signed JWTs, magic-link email sign-in over SMTP or an HTTP provider, Google/Apple OIDC verification, roles and permissions.",
    publicApi: [
      "signSession",
      "verifySession",
      "requestMagicLink",
      "verifyMagicLink",
      "verifyOidcToken",
      "can",
      "mailerFromEnv",
      "SmtpMailer",
    ],
  },
  {
    id: "persistence",
    path: "src/persistence",
    version: "0.9.0",
    layer: "platform",
    stability: "preview",
    summary: "Store implementations behind the domain interfaces: in-memory, JSON file, and PostgreSQL.",
    publicApi: ["fileStores", "pgStores", "jsonFile"],
    caveat: "The Postgres backend is written against the same interfaces but has not been exercised against a live database here.",
  },
  {
    id: "providers",
    path: "src/providers",
    version: "0.8.0",
    layer: "platform",
    stability: "preview",
    summary:
      "Training-service connectors — Strava, Garmin, Polar, Suunto — with normalisers tested against each service's own payload shape, plus the registry and sample data.",
    publicApi: ["providerRegistry", "authorizeUrl", "fetchActivities", "refreshToken", "connections"],
    caveat:
      "Normalisation, pagination, token refresh and rate-limit handling are implemented and tested against representative fixtures, but no call has been made to a live provider API from here — that needs network egress, a registered application and a real athlete's consent. `npm run verify:providers` performs that check wherever those exist; see docs/provider-import.md.",
  },
  {
    id: "commerce",
    path: "src/commerce",
    version: "0.8.0",
    layer: "platform",
    stability: "preview",
    summary: "Cart, orders, Stripe checkout with HMAC webhook verification, and affiliate hand-off to partner shops.",
    publicApi: ["buildCart", "createCheckout", "verifyWebhook", "affiliateLinks", "recordAffiliateClick"],
    caveat:
      "Direct sale is switched off for Phase 1. The Stripe path is implemented and unit-tested but not yet verified against a live test-mode account, and no affiliate programme is signed, which the UI states plainly.",
  },
  {
    id: "users",
    path: "src/users",
    version: "1.0.0",
    layer: "platform",
    stability: "stable",
    summary: "Accounts, roles, org membership and the athlete's body & health profile.",
    publicApi: ["userStore", "profileStore", "DEFAULT_PROFILE"],
  },
  {
    id: "settings",
    path: "src/settings",
    version: "1.0.0",
    layer: "platform",
    stability: "stable",
    summary: "Platform settings an owner can change at runtime.",
    publicApi: ["settingsStore", "DEFAULT_SETTINGS"],
  },
  {
    id: "content",
    path: "src/content",
    version: "1.0.0",
    layer: "platform",
    stability: "evolving",
    summary: "The nutrition guide: long-form articles behind the engine's advice.",
    publicApi: ["nutritionGuide"],
    caveat: "The sixteen articles are English-only; the interface around them is translated into all four languages.",
  },
  {
    id: "api",
    path: "src/api",
    version: "1.4.0",
    layer: "platform",
    stability: "stable",
    summary:
      "Two HTTP surfaces: `/api/*`, the pure router our own app uses, shared by the Node server and the Vercel adapter; and `/v1/*`, the versioned public engine contract with per-tenant keys, rate limiting and usage metering.",
    publicApi: [
      "createApiRouter",
      "api",
      "isApiConfigured",
      "getSessionToken",
      "v1Plan",
      "v1Events",
      "v1EventPlan",
      "v1Course",
      "v1Absorption",
      "v1Heat",
      "issueApiKey",
      "checkApiKey",
      "RateLimiter",
      "UsageMeter",
    ],
  },

  // ---- Interface: React and the browser -----------------------------------
  {
    id: "components",
    path: "src/components",
    version: "1.8.0",
    layer: "interface",
    stability: "stable",
    summary: "Every screen and shared control, from the planner and the race forecast to the admin views.",
    publicApi: ["App", "Planner", "RouteInsights", "RaceForecast", "SessionDebrief", "LoadProfileCard"],
  },
  {
    id: "i18n",
    path: "src/i18n",
    version: "1.2.0",
    layer: "interface",
    stability: "stable",
    summary:
      "Four typed dictionaries — German, French, Italian, English — with placeholder interpolation, plural siblings and per-locale guard tests.",
    publicApi: ["useT", "translate", "detectLang", "LANGS", "type TranslationKey"],
  },
  {
    id: "theme",
    path: "src/theme",
    version: "1.0.0",
    layer: "interface",
    stability: "stable",
    summary: "Light, dark and system appearance, applied to the document root and persisted.",
    publicApi: ["useTheme", "applyTheme"],
  },
  {
    id: "ui",
    path: "src/ui",
    version: "1.1.0",
    layer: "interface",
    stability: "stable",
    summary:
      "Cross-cutting interface primitives: toasts, confirmation dialogs, a focus trap, and the media-query hook the navigation uses to change shape rather than just appearance.",
    publicApi: ["toast", "confirm", "useFocusTrap", "useMediaQuery"],
  },

  // ---- Surfaces: deployable entry points ----------------------------------
  {
    id: "server",
    path: "server",
    version: "1.0.0",
    layer: "surface",
    stability: "stable",
    summary: "The Node HTTP server: static hosting plus the shared API router on one origin.",
    publicApi: ["server/index.ts"],
  },
  {
    id: "serverless",
    path: "api",
    version: "1.0.0",
    layer: "surface",
    stability: "stable",
    summary: "The Vercel adapter, wrapping the identical pure router so both deployments cannot drift.",
    publicApi: ["api/[...path].ts"],
  },
  {
    id: "mobile",
    path: "mobile",
    version: "0.7.0",
    layer: "surface",
    stability: "preview",
    summary:
      "The Expo application, talking to the same API as the web app, with a react-native-web harness so parity is proven in CI.",
    publicApi: ["mobile/App.tsx", "mobile/src"],
    caveat: "Verified through the react-native-web harness; native HealthKit and Health Connect reads need a physical device.",
  },
  {
    id: "scripts",
    path: "scripts",
    version: "1.1.0",
    layer: "surface",
    stability: "stable",
    summary:
      "Build, deployment and verification tooling: the production preflight, the deployed-behaviour check, the browser e2e journey, the mobile parity smoke, host config, icons, payment checks.",
    publicApi: ["preflight.ts", "verify-deploy.mjs", "e2e-smoke.mjs", "mobile-smoke.mjs", "host-config.mjs"],
  },
] as const;

/** Look a module's version up by id. Throws on an unknown id — a typo here is a bug. */
export function moduleVersion(id: string): string {
  const found = MODULES.find((m) => m.id === id);
  if (!found) throw new Error(`unknown module: ${id}`);
  return found.version;
}

export interface VersionManifest {
  platform: string;
  modules: readonly ModuleVersion[];
  /** Counts by stability, so a deployment can be described in one line. */
  stability: Record<ModuleStability, number>;
}

/** The whole picture, as served by `GET /api/version`. */
export function versionManifest(): VersionManifest {
  const stability: Record<ModuleStability, number> = { stable: 0, evolving: 0, preview: 0 };
  for (const m of MODULES) stability[m.stability]++;
  return { platform: PLATFORM_VERSION, modules: MODULES, stability };
}
