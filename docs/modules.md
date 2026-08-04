# Module reference

Every module in the platform: what it owns, what may be imported from it, and
how far its contract can be trusted.

The machine-readable version of this document is [`src/version.ts`](../src/version.ts),
and `src/version.test.ts` fails the build if the two disagree — a module cannot
be added to `src/` without appearing in both. `GET /api/version` serves the same
manifest from a running deployment.

## How versioning works here

Two questions need two answers, so there are two kinds of version.

**The platform version** identifies a release of You Go Further as a whole: what
gets deployed, what `GET /api/version` reports, what a bug report should name. It
lives in `PLATFORM_VERSION`, and `package.json` and the runtime config both read
from there rather than carrying their own copy. See [`CHANGELOG.md`](../CHANGELOG.md).

**Each module carries its own version**, describing that module's contract — the
exports other modules may depend on:

| Bump | When |
| ---- | ---- |
| major | an export was removed or changed meaning; callers must be edited |
| minor | a capability was added, and everything that compiled before still does |
| patch | a fix or internal change with no visible contract |

Module versions move independently of the platform version and of each other.
`src/engine` at 1.2.0 alongside `src/providers` at 0.6.0 is not an inconsistency:
it says the engine's shape is settled and the connectors' is not.

**Stability** is the honest label on top of the number:

- **stable** — settled contract, real implementation behind it.
- **evolving** — works and is tested, but the shape is still moving.
- **preview** — the interface is real, part of the implementation is a documented
  stand-in. Every `preview` module states what is missing; a label with no reason
  attached is just a shrug, and the manifest test rejects one.

## Layers

| Layer | May import | May do |
| ----- | ---------- | ------ |
| `domain` | other `domain` modules | pure computation only — no React, no `fetch`, no storage |
| `platform` | `domain`, `platform` | I/O: network, disk, database, third-party APIs |
| `interface` | anything | React and the DOM |
| `surface` | anything | a deployable entry point rather than a library |

The domain rule is enforced by a test, not by convention. It is the reason the
engine runs unchanged in a unit test, a browser, a Node server and an edge
function — and the reason the same simulation can never give two answers on two
surfaces.

---

## Domain

### `src/engine` — 1.2.0, stable

The recommendation engine, and the largest module in the platform. Documented
file by file in [`docs/engine.md`](./engine.md); the physiology behind it is in
[`docs/nutrition-spec.md`](./nutrition-spec.md).

Fuelling targets, product selection, the timed schedule, terrain-aware stop
placement, carbohydrate absorption ceilings, heat strain and the race simulation.

Public API: `computeTarget`, `recommend`, `buildSchedule`, `planRouteFuelling`,
`absorptionCeiling`, `checkDeliverable`, `carbBurnPerHourG`, `heatStrain`,
`heatIndexC`, `simulateRace`, `buildOffering`, `productStore`.

### `src/analysis` — 1.1.0, stable

Reading a training history rather than a single session: weekly load and
acute:chronic ratio (`analyze.ts`), Banister fitness/fatigue/form with Foster
monotony and strain (`trainingLoad.ts`), the past-run debrief that holds a plan
against what the athlete reported (`debrief.ts`), and the anonymous
cross-athlete cohort with Wilson intervals (`cohort.ts`).

Public API: `analyzeActivities`, `loadProfile`, `loadFlags`, `debriefSession`,
`summariseBands`, `cohortPrior`.

### `src/progress` — 1.0.0, stable

The fuelling score and the milestones an athlete is working towards.

Public API: `fuellingScore`, `progressSummary`.

### `src/feedback` — 1.0.0, stable

Session logs, and what the engine learns from them: a gut-tolerance ceiling and
a carbohydrate bias derived from what the athlete actually reported. This is the
module that lets the athlete's own history override population defaults.

Public API: `deriveAdaptation`, `feedbackStore`.

### `src/home` — 1.0.0, stable

The start screen's summary: the last seven days, the next move, and what is
still unreviewed. Pure, so the same summary can be computed on the server.

Public API: `homeSummary`.

### `src/health` — 0.9.0, **preview**

Normalising on-device health data — Apple Health, Health Connect — into sessions
and body signals.

*Preview because:* the normalisation, deduplication and profile update are real
and tested, but the device read itself needs a physical phone, so CI drives it
through a documented stand-in.

Public API: `ingestHealthSamples`.

### `src/subscription` — 1.0.0, stable

Tiers and entitlements, and `effectiveTier()` — the switch that gives every
athlete the full feature set while subscriptions are off for the Phase 1 Swiss
launch.

Public API: `effectiveTier`, `planFor`, `TIERS`.

### `src/data` — 1.0.0, stable

The ingestion pipeline: provider registry, deduplication, concurrent ingest, the
activity store, export, and the warehouse sink.

Public API: `ingest`, `activityStore`, `exportActivities`, `databricksSink`.

---

## Platform

### `src/geo` — 1.0.0, stable

Swiss terrain and weather. swisstopo elevation profiles and national basemaps,
MeteoSwiss SwissMetNet stations with an ICON-CH model fallback, and a tolerant
GPX parser that accepts namespaced elements, either attribute order, CRLF and
self-closing tags.

*Caveat:* every remote source has a labelled offline fallback, and the UI always
names which one it used. The live responses cannot be exercised from a
network-restricted environment.

Public API: `enrichRoute`, `elevationProfile`, `fetchWeather`, `parseGpx`,
`basemapLayers`.

### `src/auth` — 1.0.0, stable

Sessions, signed JWTs, magic-link email sign-in, Google and Apple OIDC token
verification, roles and permissions. See [`docs/auth.md`](./auth.md).

Public API: `signSession`, `verifySession`, `requestMagicLink`,
`verifyMagicLink`, `verifyOidcToken`, `can`.

### `src/persistence` — 0.9.0, **preview**

Store implementations behind the domain interfaces: in-memory, JSON file, and
PostgreSQL.

*Preview because:* the Postgres backend is written against the same interfaces
and typed, but has not been exercised against a live database here.

Public API: `fileStores`, `pgStores`, `jsonFile`.

### `src/providers` — 0.6.0, **preview**

Training-service connectors — Strava, Garmin, Polar, Suunto — plus the registry,
connection records and sample data.

*Preview because:* authorisation URLs and scopes are the real ones, but token
exchange and live API calls are the documented next step. The UI labels sample
data as sample data rather than implying a live sync.

Public API: `providerRegistry`, `authorizeUrl`, `fetchActivities`, `connections`.

### `src/commerce` — 0.8.0, **preview**

Cart, orders, Stripe Checkout with HMAC webhook verification, and the affiliate
hand-off to partner shops.

*Preview because:* direct sale is switched off for Phase 1 — the brands ship and
pay commission. The Stripe path is implemented and unit-tested but not verified
against a live test-mode account, and no affiliate programme is signed yet,
which the UI states plainly rather than implying a partnership.

Public API: `buildCart`, `createCheckout`, `verifyWebhook`, `affiliateLinks`,
`recordAffiliateClick`.

### `src/users` — 1.0.0, stable

Accounts, roles, org membership, and the athlete's body & health profile — which
lives on the server so it follows the athlete across devices, with localStorage
as a synchronous cache.

Public API: `userStore`, `profileStore`, `DEFAULT_PROFILE`.

### `src/settings` — 1.0.0, stable

Platform settings an owner can change at runtime.

Public API: `settingsStore`, `DEFAULT_SETTINGS`.

### `src/content` — 1.0.0, evolving

The nutrition guide: sixteen long-form articles behind the engine's advice.

*Evolving because:* the articles are English-only. The interface around them is
translated into all four languages.

Public API: `nutritionGuide`.

### `src/api` — 1.2.0, stable

Two HTTP surfaces behind one pure router. `handlers.ts` is request in, response
out, with no Node and no Vercel in it — which is what lets `server/index.ts` and
`api/[...path].ts` share it and never drift. `client.ts` is the browser side.

**`/api/*`** serves our own app. Every activity read is scoped to the signed-in
principal; the OAuth flow binds identity to a one-time `state` minted by an
authenticated call, so a consent redirect carrying no Authorization header still
lands on the right account.

**`/v1/*`** is the public engine contract — see [`public-api.md`](./public-api.md).
It is deliberately a different surface with different rules: its own
`CONTRACT_VERSION`, flattened responses, golden shape tests, API-key
authentication rather than a session, and no storage or identity of its own. A
request carries everything its answer needs.

`apiKeys.ts` issues scoped, revocable per-tenant credentials, storing only a
SHA-256 hash. `rateLimit.ts` is a per-key token bucket plus aggregate usage
metering — counts, never requests.

Public API: `createApiRouter`, `api`, `isApiConfigured`, `getSessionToken`,
`v1Plan`, `v1Course`, `v1Absorption`, `v1Heat`, `issueApiKey`, `checkApiKey`,
`RateLimiter`, `UsageMeter`.

---

## Interface

### `src/components` — 1.2.0, stable

Every screen and shared control: the planner, route insights, the race forecast,
the session debrief, the load profile card, catalog, cart, admin and team views,
onboarding, and the shared primitives (`Stat`, `Switch`, `Explain`, `BuyLink`).

Public API: `App`, `Planner`, `RouteInsights`, `RaceForecast`, `SessionDebrief`,
`LoadProfileCard`.

### `src/i18n` — 1.1.0, stable

Four typed dictionaries — German, French, Italian, English — with `{placeholder}`
interpolation and `_one` plural siblings. `de`, `fr` and `it` are typed against
`en`, so a forgotten translation is a compile error. Guard tests check parity,
placeholders, accents, Swiss orthography (ss, never ß), dead keys and house
style. See [`docs/i18n.md`](./i18n.md).

Public API: `useT`, `translate`, `detectLang`, `LANGS`, `TranslationKey`.

### `src/theme` — 1.0.0, stable

Light, dark and system appearance, applied to the document root and persisted.

Public API: `useTheme`, `applyTheme`.

### `src/ui` — 1.0.0, stable

Cross-cutting interface primitives: toasts, confirmation dialogs, focus trap.

Public API: `toast`, `confirm`, `useFocusTrap`.

---

## Surfaces

### `server` — 1.0.0, stable

The Node HTTP server: static hosting plus the shared API router on one origin.

### `api` — 1.0.0, stable

The Vercel adapter, wrapping the identical pure router so the two deployments
cannot drift.

### `mobile` — 0.7.0, **preview**

The Expo application, talking to the same API as the web app. `mobile/verify/`
is a react-native-web harness that drives the real screens in a browser, so
parity is proven in CI rather than asserted.

*Preview because:* native HealthKit and Health Connect reads need a physical
device.

### `scripts` — 1.0.0, stable

Build and verification tooling: `e2e-smoke.mjs` (the full browser journey),
`mobile-smoke.mjs` (mobile parity), `host-config.mjs`, `gen-icons.mjs`,
`stripe-verify.mjs`.

---

## Root files

| File | Purpose |
| ---- | ------- |
| `src/version.ts` | the manifest above, machine-readable |
| `src/config.ts` | runtime configuration, resolved once; the single source for feature switches |
| `src/model.ts` | the shared `Activity` shape every module agrees on |
| `src/runtime.ts` | wiring: which stores and providers a given configuration gets |
| `src/App.tsx` | the shell — navigation, routing, providers |
| `src/styles.css` | the whole design system: one token set, no component hard-codes a colour |
