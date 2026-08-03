# Changelog

Releases of the You Go Further platform. Individual modules carry their own
versions — see [`docs/modules.md`](docs/modules.md) for the rule and
[`src/version.ts`](src/version.ts) for the manifest. `GET /api/version` reports
both from a running deployment.

The platform version answers "which release is this?". A module version answers
"has this module's contract changed?". They move independently, on purpose.

## 0.3.0

The release that made the platform describable: every module versioned,
documented and reported by the running server.

**Added**

- **Version manifest** (`src/version.ts`): a per-module version, layer,
  stability label and public API for all 25 modules, plus the platform version.
  `package.json` and the runtime config now read the platform version from here
  instead of each carrying their own copy — before this, the repository claimed
  `0.1.0` in one place and `0.2.0` in another.
- **`GET /api/version`** — what is actually deployed, module by module.
- **Documentation**: [`docs/modules.md`](docs/modules.md) (every module: what it
  owns, what may be imported from it, and why anything less than stable is less
  than stable) and [`docs/engine.md`](docs/engine.md) (the engine file by file).
- **Manifest tests** (`src/version.test.ts`): a module cannot be added to `src/`
  without being versioned and documented, a `preview` label must state what is
  missing, and the `domain` layer is checked to be free of React, `fetch` and
  `localStorage` — the property that lets the engine run unchanged in a test, a
  browser, a server and an edge function.

**Engine — 1.1.0 → 1.2.0**

- **Heat strain** (`heatStrain.ts`): apparent temperature via the Rothfusz heat
  index, sweat rate from intensity × body mass with a humidity penalty where
  evaporation starts failing, sodium loss at that rate, and the rise in glycogen
  use in the heat, capped at +25 %. A measured sweat rate or sweat sodium always
  overrides the model and says which was used.
- **Race simulation** (`simulate.ts`): the route walked segment by segment with
  carbohydrate, fluid, sodium and time tracked against the athlete's own store.
  Runs the course twice — with the plan and on water alone — and names the
  kilometre where each crosses the fade line.

**Interface — components 1.1.0 → 1.2.0, i18n 1.0.0 → 1.1.0**

- The **race forecast** card: both curves against the fade line, the four figures
  behind them, and any warnings, in all four languages. Warnings carry their
  numbers as well as their English sentence, so each locale writes its own.

**Fixed**

- Legend colour swatches were scoped to the energy strip, leaving the
  fitness/fatigue legend as two words with no way to tell which curve was which.
- The bonk marker was an SVG circle in a non-uniformly scaled plot, drawn as an
  ellipse — wider on a desktop than on a phone.
- The forecast headline and its first warning stated the same thing twice.
- Reported kilometres carried a decimal, implying a precision the model does not
  have.

## 0.2.0

Phase 1 unblocked: the free Swiss app, earning through affiliate commission
rather than subscriptions.

- Subscriptions and direct sale switched off behind `subscriptionsEnabled` and
  `sellDirect`; every tier serves the full feature set.
- Affiliate hand-off to partner shops, with honest labelling when no programme
  is signed.
- Race import from GPX, and a fuelling plan for a course never run before.
- Absorption ceilings, training load analytics, and anonymous cross-athlete
  cohort learning.
- The past-run debrief, French and Italian dictionaries, and the start screen.

## 0.1.0

The first working platform: engine, connectors, activity pipeline, planner,
insights, catalog, auth, and the Node and Vercel deployments sharing one router.

---

## Why the platform is not 1.0.0

Three things are interfaces with a documented stand-in behind them, and the
platform reaches 1.0.0 when they are real:

- **Connectors** (`src/providers`, 0.6.0) — authorisation URLs and scopes are the
  real ones; token exchange and live API calls are the next step.
- **Payments** (`src/commerce`, 0.8.0) — implemented and unit-tested, not yet
  verified against a live Stripe test-mode account.
- **On-device health** (`src/health`, 0.9.0; `mobile`, 0.7.0) — normalisation is
  real and tested, but native HealthKit and Health Connect reads need a physical
  device.

Modules that *are* settled carry 1.x versions today. That is the point of
versioning them separately: the engine's contract does not become provisional
because a connector's is.
