# You Go Further

Personalized **Swiss sports nutrition recommendations** for endurance athletes.
Give it your **goal** and the **session** (activity, duration, intensity, body
weight, conditions) and it returns a before / during / after fueling plan with
matching Swiss products from **Sponser** and **Winforce**.

Scope: general endurance — running, trail running, cycling, triathlon, swimming.

## What's in here

| Piece | Path | What it is |
| --- | --- | --- |
| **Recommendation engine** | `src/engine/` | Framework-agnostic TypeScript. Turns an `AthleteInput` into a full `Recommendation`. No React/DOM dependency. |
| **Swiss product catalog** | `src/engine/catalog.ts` | Editable data: Sponser & Winforce products with macros, sodium, caffeine, phase tags. |
| **Domain spec** | `docs/nutrition-spec.md` | The nutrition logic, goal taxonomy, and fueling formulas — the "why" behind the numbers. |
| **Web app** | `src/App.tsx`, `src/main.tsx` | React + Vite UI over the engine, live-updating as you change inputs. |
| **Tests** | `src/engine/recommend.test.ts` | Vitest suite for the engine (carb bands, goals, hydration, product selection). |

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
