# Endurance Nutrition Recommendation — Domain Spec

This document describes the domain model and the logic the recommendation engine
(`src/engine`) implements. It is the source of truth for *why* the numbers come
out the way they do. The engine is deliberately data-driven: the product catalog
and the formulas here are meant to be reviewed and tuned by a sports nutritionist.

> **Scope:** general endurance — running, trail running, cycling, triathlon, and
> swimming. Guidance is for healthy adults and is **not medical advice**.

## 1. Inputs (`AthleteInput`)

| Field | Type | Notes |
| --- | --- | --- |
| `goal` | Goal | What the athlete is training for — drives fueling aggressiveness. |
| `activity` | Activity | Session type. Mainly affects practicality of mid-session fueling. |
| `durationMin` | number | Planned session length in minutes. |
| `intensity` | easy / moderate / hard / race | Perceived effort. |
| `bodyWeightKg` | number | Used for pre/post carb and protein dosing (per-kg). |
| `conditions` | cool / temperate / hot | Hydration + sodium modifier. |
| `sweatLevel` | light / average / heavy | Scales fluid and sodium. |
| `caffeineOk` | boolean | Opt-in to caffeine suggestions. |

## 2. Goal taxonomy

| Goal | Intent | Carb factor (during) | Post-carb (g/kg) |
| --- | --- | --- | --- |
| `general-fitness` | Train comfortably, don't over-fuel | ×0.85 | 0.8 |
| `endurance-performance` | Go longer/faster, build carb tolerance | ×1.1 | 1.0 |
| `race-preparation` | Rehearse race-day fueling, train the gut | ×1.15 | 1.0 |
| `weight-loss` | Fat loss while protecting hard sessions | ×0.6 (0 on short/easy) | 0.4 |
| `recovery-focus` | Fast turnaround between sessions | ×1.0 | 1.2 |

## 3. During-session carbohydrate

Base target by duration and intensity, before the goal factor
(`baseCarbPerHour`):

| Duration | easy | moderate | hard / race |
| --- | --- | --- | --- |
| < 45 min | 0 | 0 | 0 |
| 45–75 min | 0 | 20 | 30 |
| 75–150 min | 30 | 45 | 60 |
| ≥ 150 min | 50 | 70 | 90 |

Then: `carbPerHour = round-to-5( base × goalFactor )`, clamped to **0–120 g/h**.

- **Weight-loss override:** sessions under 90 min that aren't a race are fueled
  with water only (carb/h = 0) — carbohydrate is periodised to the sessions that
  need it.
- **Multiple transportable carbohydrates:** any target above **60 g/h** requires
  a glucose+fructose (≈2:1) source, because a single glucose transporter
  saturates around 60 g/h. The engine sets `requiresMultiTransportable` and only
  selects `multiTransportable` carb products in that case.
- `carbTotalG = round( carbPerHour × durationHours )`.

This mirrors mainstream guidance: ~30 g/h for 1–2 h efforts, 30–60 g/h up to
~2.5 h, and 60–90 g/h (up to ~120 for trained, gut-adapted athletes) beyond that.

## 4. Hydration and sodium

**Fluid (ml/h)** — base by intensity, adjusted for environment, clamped 300–1000:

- Base: easy 400 · moderate 550 · hard 650 · race 700
- Hot +200 · Cool −100 · Heavy sweat +150 · Light sweat −100

**Sodium (mg/L)** — clamped 300–1100:

- Base 500 · heavy sweat → 800 · light sweat → 350 · hot +150

## 5. Pre-session (`preCarbGrams`)

A carbohydrate-focused meal/snack 1–3 h out, low in fat and fibre:

- Base 0.8 g/kg; 1.5 g/kg if the session is long (≥90 min) or hard; 2 g/kg for a
  long race.
- Weight-loss reduces the per-kg figure by 0.6 (floor 0.5 g/kg).

## 6. Post-session (`postGrams`)

- Protein: **0.3 g/kg**.
- Carbohydrate: goal-dependent per-kg (table above), halved for short easy
  sessions (< 60 min and not hard/race).
- Refuel within ~60 min, replace fluids at ~1.5× losses.

## 7. Product selection

Products live in `src/engine/catalog.ts` as editable data. Each is tagged with
the phases it fits, macros, sodium, optional caffeine/protein, and whether it is
multi-transportable.

- **During:** a drink mix is the primary carrier (carbs + fluid + sodium); a gel
  tops up carbs on the move. When `requiresMultiTransportable`, only 2:1 sources
  are eligible. A caffeinated gel is offered **only** if `caffeineOk` and the
  effort is long/hard/race. Heavy sweaters or hot conditions add a standalone
  electrolyte. If carb/h is 0, a calorie-free hydration tab is offered instead.
- **Pre / Post:** filtered to phase-appropriate products (≥20 g carb pre;
  recovery or ≥10 g protein post).

## 8. Product catalog (Swiss brands)

All products are from established Swiss sports-nutrition brands: **Sponser Sport
Food** (Wollerau, ZH) and **Winforce** (Winterthur, ZH). Values are approximate
per-serving figures for driving recommendations — always confirm against the
current label before a race.

## 9. Testing

`src/engine/recommend.test.ts` covers the carbohydrate bands, goal effects,
hydration/sodium scaling, the multi-transportable rule, caffeine opt-in, and the
"Swiss brands only" and disclaimer invariants. Run with `npm test`.
