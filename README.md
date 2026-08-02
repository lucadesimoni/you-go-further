# You Go Further

> **Naming.** **Fuel Labs** is the company; **You Go Further** is the product
> athletes see — the brand in the app, the page title, and every string. The two
> are never mixed on a user-facing surface. `docs/vision.md` is the one place
> that speaks as the company, because it is the company's roadmap.

A **Swiss endurance-nutrition platform**. Connect your training services
(**Strava, Garmin, Polar, Suunto**), analyse your training load, and get
personalised before / during / after fuelling with Swiss products from **Sponser**
and **Winforce** — tailored to your goal and each session.

Scope: general endurance — running, trail running, cycling, triathlon, swimming.
The Phase-1 launch leads with running, trail running and triathlon.

**House style.** Swiss/British English: *fuelling*, *fuelled*, *personalised*,
*normalised*. The athlete does **sessions** — "activity" is a model term, not a
word any screen says. Guard tests keep the four dictionaries in step; the
spelling is a convention, kept by review.

## What's in here

| Piece | Path | What it is |
| --- | --- | --- |
| **Recommendation engine** | `src/engine/` | Framework-agnostic TypeScript. Turns an `AthleteInput` into a full `Recommendation`. |
| **Swiss product catalog** | `src/engine/catalog.ts` | Editable data: Sponser & Winforce products with macros, sodium, caffeine, phase tags. |
| **Race import** | `src/geo/gpx.ts`, `RaceImport` | Drop the organiser's GPX and get the fuelling for that exact course, before running it. |
| **Affiliate** | `src/commerce/affiliate.ts` | Hand-off to the brand's own shop with attribution and a click ledger — the revenue model, with no invented publisher ids. |
| **Provider connectors** | `src/providers/` | Strava/Garmin/Polar/Suunto: real OAuth config + a common `ActivityProvider` interface, with a runnable sample-data implementation. |
| **Data connectivity** | `src/data/` | Backend-neutral `ActivityStore`, an `IngestionPipeline` (fetch → normalize → dedup → store), and an `ExportSink` seam for a warehouse/lake. |
| **Analysis** | `src/analysis/` | Training load, acute:chronic workload ratio, weekly trends, and weekly nutrition demand (feeds the engine). |
| **Subscription (Abo)** | `src/subscription/` | Base / Pro / Elite tiers with data-driven feature gating — **off for the free Phase-1 launch**, one config flag away for B2B. |
| **RBAC** | `src/auth/` | Roles → permissions (athlete, coach, nutritionist, admin, owner), orthogonal to tiers. |
| **Runtime config** | `src/config.ts`, `public/config.js` | Env + runtime-injected config so one build runs in any environment. |
| **Composition root** | `src/runtime.ts` | Wires store/providers/sinks from config — swap a backend without code changes. |
| **Design system** | `src/styles.css`, `docs/design-system.md` | One token layer driving light + dark, with contrast-safe "ink" variants for text. |
| **Languages** | `src/i18n/`, `docs/i18n.md` | Swiss German, French, Italian + English, with per-locale guard tests for parity, placeholders, accents and ss-not-ß. |
| **Domain spec** | `docs/nutrition-spec.md` | The nutrition logic, goal taxonomy, and fuelling formulas. |
| **Architecture / deploy / flows** | `docs/` | `architecture.md`, `deployment.md`, `user-flows.md`. |
| **Vision & roadmap** | `docs/vision.md` | The seven phases, plus an honest read of where this code stands against Phase 1. |
| **Web app** | `src/App.tsx`, `src/components/` | React + Vite UI: planner, dashboard, team, catalog, admin — gated by role. |
| **Tests** | `src/**/*.test.ts` | 46 Vitest cases across engine, analysis, data pipeline, subscription, RBAC, and runtime. |

## Deploy anywhere

Same build, any environment — configuration is read at runtime (`config.js` / env).

```bash
npm run dev                          # Codespaces / local dev (Vite, :5173)
npm run server                       # HTTP API + static app on :8787
docker compose up --build            # container → nginx on :8080
npm run build                        # static dist/ for Vercel/Netlify/S3/Pages
```

The app runs fully client-side by default; set `apiBaseUrl` to route through the
HTTP API (`server/index.ts`, sharing `src/api/handlers.ts` with the browser). See
**`docs/demo.md`** for the end-to-end backend + frontend + analysis + admin proof.

It's also an **installable PWA** — manifest, brand icons (`npm run icons`), and a
service worker (`public/sw.js`) give it an offline app shell and an "Add to Home
Screen" install on mobile/desktop. API traffic always hits the network so data
stays live. A native **Expo / React Native app** lives in **`mobile/`** (see
`mobile/README.md`) — it is at feature parity with the web app and shares this
platform's API, so the phone and the browser are one account.

See **`docs/deployment.md`** for the full config matrix and backend-swap guide,
and **`docs/user-flows.md`** for the per-role journeys (athlete, coach,
nutritionist, org admin/owner). A `.devcontainer` is included for GitHub
Codespaces and CI runs typecheck → test → build → Docker on every push.

> **Status:** connectors and the data store are production-shaped interfaces with
> a working **mock** implementation — OAuth URLs are real, but live token
> exchange, API calls, and a real warehouse backend are the documented next step.
> Sample activity data is labelled as such in the UI. See `docs/architecture.md`.

## Getting started

```bash
npm install
npm run dev        # start the app (Vite dev server)
npm test           # run the engine test suite
npm run build      # typecheck + production build
npm run e2e        # real-browser journey through the web app (needs a running server)
npm run e2e:mobile # the same for the mobile app, rendered via react-native-web
npm run verify:payments  # a whole purchase against a wire-accurate Stripe double
```

## Using the engine directly

```ts
import { recommend } from "./src/engine";

const rec = recommend({
  goal: "race-preparation",
  activity: "cycling",
  durationMin: 210,
  intensity: "hard",
  bodyWeightKg: 72,
  conditions: "hot",
  sweatLevel: "heavy",
  caffeineOk: true,
});

console.log(rec.target);  // carb/h, fluid/h, sodium/L, ...
console.log(rec.phases);  // pre / during / post plans with product picks
console.log(rec.notes);   // goal-specific guidance + disclaimer
```

## Notes

General guidance for healthy adults — **not medical advice**. Product nutrition
values are approximate; check the current label before racing. Catalog and
formulas are meant to be reviewed and tuned by a sports nutritionist.
