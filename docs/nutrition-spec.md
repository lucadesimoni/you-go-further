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

## 4b. Physiology-driven personalization ("optimized for your body")

When measured body signals are supplied (a sweat test, or a wearable via the
connectors), they **override** the population estimates above and the output is
marked with its provenance (`hydrationSource` / `sodiumSource` = `measured` vs
`estimated`):

- **Measured sweat rate** → fluid target replaces ~80 % of losses, capped at
  gut-absorption (~1200 ml/h). Beats the intensity/heat bucket.
- **Measured sweat sodium** (mg/L) → used directly (clamped 300–1500). ≥ 900 mg/L
  flags a salty sweater and adds a standalone electrolyte.
- **Training readiness** (0–100) → below 45 raises post-session recovery carbs
  (×1.15) and emphasizes recovery; a note surfaces the reason.
- **Overnight HRV vs. baseline** → below 0.9× baseline flags suppressed recovery.

Device signals (readiness, HRV, resting HR, sleep) are derived from wellness data
in `src/analysis` (`derivePhysiology`); sweat metrics come from a sweat test the
athlete enters (or `estimateSweatRateMlPerH` as a labelled estimate). This is the
layer that moves recommendations from *a body like yours* to *your body*.

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

## 7. Product selection — the "ideal offering" algorithm

Product choice is a transparent **scoring** engine (`src/engine/offering.ts`),
the single source of truth that `recommend()` delegates to. It fills the
functional **slots** a plan needs and, for each, scores every catalogue product
0–100 with plain-language reasons, so the UI can always answer "why this, why
now". Slots:

| Slot | Needed when | Ideal product |
| --- | --- | --- |
| `carb-carrier` | carb/h > 0 | drink mix; carb density near the per-hour target, 2:1 preferred |
| `carb-topup` | carb/h > 0 | gel/bar on the move; caffeine only if opted in |
| `electrolyte` | heat / heavy or salty sweater | standalone high-sodium |
| `hydration` | carb/h = 0 | calorie-free electrolyte |
| `pre-fuel` | always | ≥20 g carb, low fat/fibre |
| `recovery` | always | carb + protein (protein-forward on weight-loss) |

Scoring blends **carb-density fit** to the target, a **multi-transportable**
bonus (hard-required above 60 g/h), **sodium fit**, **caffeine** (excluded unless
`caffeineOk` on a long/hard effort), and **goal** shaping (e.g. weight-loss
rewards protein density and calorie-free hydration). Custom/house products score
in the same pass, so an admin's product wins a slot the moment it fits best.
`POST /api/offering` returns the full offering; `productUsage(product)` gives a
session-independent "best when / avoid when" guide that powers the catalogue's
when-to-use view.

Every phase also returns a `rationale[]` — a short, plain-language explanation of
which ingredients and combo were chosen (e.g. "one drink covers carbs, fluid and
sodium together, and it's a 2:1 glucose+fructose mix so you can absorb 60 g/h+").
The planner shows this in a collapsible "Why these" so the insight is there
without cluttering the plan.

## 8. Product catalog (Swiss brands + admin library)

Built-in products are from established Swiss sports-nutrition brands — **Sponser
Sport Food**, **Winforce**, **MOOV**, and **KAEX** — each with a shop link. Values
are approximate per-serving figures; always confirm against the current label
before a race.

On top of the built-ins, an admin/nutritionist (permission `catalog:edit`) runs a
**product library**: add own/house products, override a built-in's values, and set
shop URLs. The library is **Swiss-only** by curation (`normalizeProduct` rejects
non-Swiss) and merges over the built-in catalog by id (`mergeCatalog`), so custom
products flow straight into recommendations. It is served at `/api/products` and
persists via the same memory/file/Postgres backends as the rest of the platform;
the pure client-side build falls back to `localStorage`.

## 9. Testing

`src/engine/recommend.test.ts` covers the carbohydrate bands, goal effects,
hydration/sodium scaling, the multi-transportable rule, caffeine opt-in, and the
"Swiss brands only" and disclaimer invariants. Run with `npm test`.
