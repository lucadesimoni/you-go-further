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
| **Domain spec** | `docs/nutrition-spec.md` | The nutrition logic, goal taxonomy, and fueling formulas. |
| **Architecture** | `docs/architecture.md` | How the modules fit together and where real backends plug in. |
| **Web app** | `src/App.tsx`, `src/components/` | React + Vite UI: a fuel planner plus a connect-&-analyse dashboard. |
| **Tests** | `src/**/*.test.ts` | 35 Vitest cases across engine, analysis, data pipeline, and subscription. |

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
