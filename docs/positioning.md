# Positioning — You Go Further vs. Garmin and MOOV

> **Purpose:** enable people to go further by giving them **data-based nutrition,
> optimized for their body and their training.**

The fastest way to see where we fit is the endurance value chain:

```
   MEASURE the training  ─────►  DECIDE what to consume  ─────►  SUPPLY the fuel
        (Garmin)                   (You Go Further)                  (MOOV, Sponser, Winforce)
     device / wearable          personalization engine            nutrition product brands
```

Garmin and MOOV are at the two ends. **We are the decision layer in the middle** —
and today nobody owns it well. Garmin knows *what you did and how ready you are*
but not *what to eat/drink for tomorrow's session*. MOOV makes an excellent
electrolyte but doesn't dose it to **your** body and **your** session from **your**
data. That gap is our reason to exist.

## Snapshot

| | **Garmin** | **MOOV** | **You Go Further** |
| --- | --- | --- | --- |
| Primary role | Capture training & physiology | Sell hydration/electrolyte product | Turn data into a personalized fueling plan |
| Category | Wearables + Garmin Connect | Swiss DTC nutrition brand | SaaS decision/recommendation layer |
| Owns | The device data (a *source* for us) | The consumable (an *output* we can recommend) | The personalization + product match |
| Personalizes… | Training metrics (load, readiness, VO2max) | Little — one formula, flavors | **Fueling** to body + session + goal + load |
| Nutrition output | Calorie/hydration *logging*; generic in-activity eat/drink reminders | A product to buy | Carb g/h, fluid ml/h, sodium mg/L, pre/during/post, **specific Swiss products** |
| "Optimized for your body" | Partial (VO2max, HRV) — not fueling | No | Yes — weight, HR, sweat level, conditions |
| "Optimized for your training" | Strong (Training Status/Readiness) | No | Yes — goal, session, and weekly load (ACWR) shape the plan |
| Device coverage | Garmin only | n/a | **Garmin + Strava + Polar + Suunto** (vendor-neutral) |
| Product stance | Locked to Garmin hardware | Single (own) brand | **Brand-neutral catalog**, nutritionist-editable |
| Business model | Hardware + Connect+ subscription | Product sales | SaaS tiers + B2B (clubs, brands), multi-tenant |

## How we relate to each

**Garmin is an input, not a competitor.** We already ingest via the Garmin Health
API and *prefer* Garmin's own training-load value when present. We don't replace
the watch — we make its data actionable for fueling. The more Garmin measures
(sweat rate, thermal load, HRV), the sharper our "optimized for your body" gets.

**MOOV is a potential output, not a competitor.** MOOV is exactly the kind of
Swiss product our engine should be able to recommend when its electrolyte profile
fits the athlete's sodium/hydration target. A recommendation layer *drives* product
sales — we can be a demand channel for brands like MOOV, Sponser, and Winforce.

## Where we must get stronger (mission-aligned roadmap)

These are honest gaps between today's foundation and the purpose:

1. **Deeper body signal.** ✅ *In progress.* Measured **sweat rate & sweat sodium**
   now override population hydration/sodium (with provenance badges), and
   **training readiness + HRV** from the wearables adjust recovery fueling and
   surface flags. Next: pull per-activity sweat-loss estimates and thermal load
   straight from the device instead of a modeled estimate.
2. **Real-time, in-session fueling.** The biggest "go further" moment is mid-race.
   Push the plan to the watch (Garmin Connect IQ data field / notifications) and
   cue "take 25 g now, drink 200 ml" on schedule. Neither Garmin nor MOOV closes
   this loop with a personalized plan.
3. **A feedback loop that learns.** Log what was *actually* consumed and how the
   session went (GI distress, bonk, splits), then tune the next recommendation.
   This is the real moat: **data-based optimization that improves per athlete** —
   something a device maker and a product brand structurally don't do.
4. **Close to commerce.** Turn a recommendation into fulfillment (cart/affiliate
   for Sponser/Winforce/MOOV). Monetize the decision, not just the subscription.

## One-line positioning

> Garmin tells you *how you're training*. MOOV gives you *something to drink*.
> **You Go Further tells you exactly what to eat and drink — dosed to your body,
> your session, and your training load — so you actually go further.**
