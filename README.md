# You Go Further

A **Swiss endurance-nutrition platform**. Connect your training services
(**Strava, Garmin, Polar, Suunto**), analyse your training load, and get
personalized before / during / after fueling with Swiss products from **Sponser**
and **Winforce** — tailored to your goal and each session.

Scope: general endurance — running, trail running, cycling, triathlon, swimming.

## What's in here

| Piece | Path | What it is |
| --- | --- | --- |
| **Recommendation engine** | `src/engine/` | Framework-agnostic TypeScript. Turns an `AthleteInput` into a full `Recommendation`. |
| **Swiss product catalog** | `src/engine/catalog.ts` | Editable data: Sponser & Winforce products with macros, sodium, caffeine, phase tags. |
| **Provider connectors** | `src/providers/` | Strava/Garmin/Polar/Suunto: real OAuth config + a common `ActivityProvider` interface, with a runnable sample-data implementation. |
| **Data connectivity** | `src/data/` | Backend-neutral `ActivityStore`, an `IngestionPipeline` (fetch → normalize → dedup → store), and an `ExportSink` seam for a warehouse/lake. |
| **Analysis** | `src/analysis/` | Training load, acute:chronic workload ratio, weekly trends, and weekly nutrition demand (feeds the engine). |
| **Subscription (Abo)** | `src/subscription/` | Base / Pro / Elite tiers with data-driven feature gating. |
| **RBAC** | `src/auth/` | Roles → permissions (athlete, coach, nutritionist, admin, owner), orthogonal to tiers. |
| **Runtime config** | `src/config.ts`, `public/config.js` | Env + runtime-injected config so one build runs in any environment. |
| **Composition root** | `src/runtime.ts` | Wires store/providers/sinks from config — swap a backend without code changes. |
| **Domain spec** | `docs/nutrition-spec.md` | The nutrition logic, goal taxonomy, and fueling formulas. |
| **Architecture / deploy / flows** | `docs/` | `architecture.md`, `deployment.md`, `user-flows.md`. |
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
stays live. A native **Expo / React Native app** that shares this platform's API
lives in **`mobile/`** (see `mobile/README.md`).

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
