# The engine

`src/engine` — **version 1.2.0**, stable, `domain` layer.

The engine takes an `AthleteInput` and produces a plan. It has no dependency on
React, the DOM, `fetch` or storage, which is deliberate and enforced by a test:
the same code runs in a unit test, in the browser, in the Node server and in an
edge function, so the plan an athlete sees on their phone cannot differ from the
plan the server computed.

This document is the map of the module. The physiology and the sources behind
the numbers are in [`nutrition-spec.md`](./nutrition-spec.md); the module's place
in the platform is in [`modules.md`](./modules.md).

## The shape of a plan

```
AthleteInput ──▶ computeTarget ──▶ FuellingTarget   (how much, per hour)
      │                                  │
      │                                  ├─▶ idealOffering ──▶ which products, and why
      │                                  ├─▶ buildSchedule ──▶ when, on the clock
      │                                  ├─▶ checkDeliverable ─▶ can the gut absorb it
      │                                  └─▶ energyProfile ──▶ availability over time
      │
      └─ + route ──▶ planRouteFuelling ──▶ where, on this course
                              │
                              └─ + weather ──▶ simulateRace ──▶ where it runs out
```

`recommend()` is the front door: it runs `computeTarget`, the offering, and the
deliverability check, and returns a `Recommendation` with a phase plan for
before, during and after.

## Files

### `types.ts` — the vocabulary

Every other module in the platform speaks these types: `Goal`, `Activity`,
`Intensity`, `Conditions`, `SweatLevel`, `AthleteInput`, `Product`,
`FuellingTarget`, `PhasePlan`, `Recommendation`.

Two are worth calling out:

- **`Provenance`** (`"measured" | "estimated"`) travels with every hydration and
  sodium target. The UI is required to show which one it got — the difference
  between a sweat test and a population bucket is the difference between advice
  and a guess, and hiding it would be the easiest lie in the product.
- **`Adaptation`** carries what the athlete's own logs have taught the engine: a
  carbohydrate ceiling derived from gut-distress reports, and a signed bias from
  repeated low-energy sessions. The athlete's own history always beats the
  population default.

### `recommend.ts` — targets and the phase plan

`computeTarget(input)` produces carbohydrate per hour and total, fluid per hour,
sodium per litre, and whether the target needs multiple transportable
carbohydrates.

**Carbohydrate per hour** starts from mainstream endurance guidance by duration
and intensity — nothing under 45 min, 20–60 g/h to 2.5 h, 50–90 g/h beyond — then
takes a goal factor (race preparation 1.15×, endurance 1.1×, general fitness
0.85×, weight loss 0.6×), then the athlete's learned adaptation, and is finally
rounded to 5 g and clamped to 0–120.

Weight-loss sessions under 90 minutes at anything but race intensity go to zero:
fuel the work that needs it, and leave the easy sessions alone.

**Fluid** uses a measured sweat rate when there is one — replacing about 80 % of
losses, capped at what the gut can take — and otherwise an intensity base
adjusted for conditions and sweat level. **Sodium** uses a measured sweat
concentration directly, or a bucket from sweat level and heat. Both report their
provenance.

`recommend()` then builds the three phases. Pre is 0.8–2 g/kg of carbohydrate
1–3 h out; post is 0.3 g/kg protein with 0.4–1.2 g/kg carbohydrate by goal,
lifted 15 % when readiness is low. Product selection is delegated entirely to
the offering engine, so there is exactly one answer to "which product, and why".

### `offering.ts` — which product, and why

Scores every catalog product for each slot (`pre-fuel`, `during-carb`,
`during-drink`, `caffeine`, `recovery`) and returns a pick, alternatives and
plain-language reasons. `productUsage()` turns a product into when-to-use
guidance for the catalog screen.

The rationale strings are part of the contract, not decoration: a recommendation
an athlete cannot interrogate is one they cannot trust.

### `catalog.ts` / `productStore.ts` — the library

The built-in Swiss product catalog, plus normalisation and merging for custom
products an admin adds. `mergeCatalog()` puts house products alongside built-ins
without letting a malformed entry through — `normalizeProduct()` fills and
clamps every field first.

### `schedule.ts` — when, on the clock

`buildSchedule()` turns a target into timed cues: carbohydrate every 20 minutes,
fluid every 15, a caffeine hit snapped to the nearest existing cue at about
two-thirds distance. Cues accumulate at the same minute rather than stacking up
as separate alerts, because an athlete gets one instruction at a time.

`formatClock()` is the shared `h:mm` formatter, so the timeline, the route plan
and the debrief can never format a time differently.

### `energy.ts` — availability over time

`energyProfile()` produces the carbohydrate-availability curve behind the
planner's strip: what is in the tank, minute by minute, with and without the
plan. This is the single-session sibling of `simulate.ts`, which does the same
thing over a real course.

### `oxidation.ts` — what the gut can absorb

The ceiling that stops the engine promising a rate no gut can take.

| Constant | Value | Basis |
| -------- | ----- | ----- |
| `GLUCOSE_ONLY_CEILING_G_PER_H` | 60 | SGLT1 saturates |
| `MULTI_TRANSPORTABLE_CEILING_G_PER_H` | 90 | glucose + fructose ~2:1 recruits GLUT5, a second route |
| `GUT_TRAINED_CEILING_G_PER_H` | 110 | only offered when the athlete's own logs already show tolerance below it |

`absorptionCeiling(sources)` reads the useful glucose:fructose band as 0.8–3.2.
`productCarbSources()` splits a product 2:1 when it declares
`multiTransportable`, and otherwise counts **all of it as glucose** — the
assumption that fails safe. Under-promising costs a little performance;
over-promising costs the session.

`checkDeliverable()` returns the `DeliverabilityCheck` that `recommend()` attaches
to the recommendation, and the UI turns into the absorption warning.

`carbBurnPerHourG()` is burn without a lookup table: a metabolic equivalent for
the effort (7 / 10.5 / 13.5 / 15.5), times body mass for kcal/h, times the
carbohydrate share of that energy (`carbEnergyFraction`: 0.45 easy to 0.9 at race
effort), divided by 4 kcal/g. A 55 kg and a 90 kg runner at the same effort no
longer burn the same.

### `routeFuelling.ts` — where, on this course

Turns an elevation profile into a plan.

1. **Cost curve.** `runningCostPerM()` is the Minetti et al. (2002) polynomial —
   the standard behind every grade-adjusted-pace implementation — clamped to the
   ±45 % gradient band it was fitted over, outside which it diverges.
   `cyclingCostPerM()` models the bike's constant-power case instead: cost per
   metre rises roughly linearly with gradient, about 4× at 10 %, and floors near
   free-wheeling on a descent.
2. **Distance to time.** `relativeSpeed()` converts through the same gradient, so
   a stop lands at the right *minute* rather than the right kilometre.
3. **Placement.** `findClimbs()` finds sustained climbs (60 m gain by default);
   feeds go shortly *before* one, never deep in a steep descent where eating is
   impractical, never in the closing minutes where the carbohydrate cannot be
   absorbed in time, and never closer than 15 minutes apart.

`RouteFuelPlan.segments` carry a `costShare` — each segment's share of the whole
route's energy cost — which is what the race simulation later spends the tank
against.

### `heatStrain.ts` — what the weather costs

`heatIndexC()` is the Rothfusz regression behind the US National Weather Service
heat index, converted to Celsius, with a passthrough below 27 °C rather than
extrapolating the formula outside its range.

`heatStrain()` returns sweat rate, sodium loss, a carbohydrate-burn multiplier,
the apparent temperature and a risk band. Sweat scales with intensity × body mass
(8–15.5 ml/h per kg), rises ~3 % per degree of apparent temperature above 15 °C,
and takes a further penalty above 60 % humidity when it is at least 20 °C — the
point where evaporation fails and sweat runs off the skin without cooling
anything. The burn multiplier is capped at +25 %, the top of the published range.

`HeatStrain.measured` is `true` only when a real measurement was supplied. Sweat
sodium varies fivefold between athletes, so the 800 mg/L default is a
placeholder, and the module says so rather than dressing it up as a finding.

### `simulate.ts` — where it runs out

`simulateRace()` walks the route segment by segment, spending the tank by each
segment's `costShare`, and tracks carbohydrate, fluid, sodium and time.

It runs the course twice — with the plan and on water alone — and reports the
kilometre where each crosses the **fade line** (`FADE_PCT`, 20 % of the usable
store), the peak fluid deficit against `DEHYDRATION_PCT` (2 % of body mass),
sodium lost against replaced, and the tank at the finish.

Warnings carry both an English sentence and the numbers behind it, so a UI writes
its own sentence in the athlete's language rather than parsing prose. Reported
kilometres are whole: a tenth would imply a precision the model does not have.

The glycogen store is 6.5 g/kg of endurance-trained muscle and liver — a
population figure, not a measurement of this athlete, and every surface that
shows the result says so.

## What the engine will not do

- **Promise a rate the gut cannot absorb.** The deliverability check runs on the
  products actually chosen; when the library has nothing suitable it checks
  against the library's best options, so the athlete gets a reason rather than an
  empty panel.
- **Present an estimate as a measurement.** Provenance travels with the number.
- **Let training defeat saturation.** A logged tolerance raises the ceiling only
  when the mix has a second transporter to raise it with.
- **Give medical advice.** It is general guidance for healthy adults, and the
  disclaimer is on the shell of every screen.

## Tests

`src/engine/*.test.ts` — energy, offering, oxidation, product store, recommend,
route fuelling, schedule, simulate. The assertions pin published values rather
than restating the implementation, which is what makes them able to catch a
regression in the model rather than a change in the code.

Run them with `npx vitest run src/engine`.
