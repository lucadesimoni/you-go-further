# Fuel Labs — Vision & Roadmap

> The vision below is kept **verbatim, in the founder's own words**. Translating
> it would blunt it. The assessment that follows it is in English, like the rest
> of these docs, and is written against what the code actually does today.

---

## Unsere Mission

Wir bauen die weltweit führende Decision Engine für Performance Nutrition.

Nicht die nächste Trainings-App.
Nicht den nächsten Gel-Hersteller.
Sondern die Intelligenz zwischen Athlet und Ernährung.

Unser Ziel ist einfach:

Jeder Athlet soll jederzeit wissen, was sein Körper wirklich braucht — automatisch,
personalisiert und ohne darüber nachdenken zu müssen.

## Phase 1 — Product Market Fit 🇨🇭

Launch einer kostenlosen App für den Schweizer Markt. Fokus bewusst klein halten:

- Running
- Trail Running
- Triathlon

Der Nutzer verbindet Garmin oder Strava, importiert einen Wettkampf oder eine Route
und erhält sofort seinen personalisierten Fueling-Plan. Anschliessend kann er die
empfohlenen Produkte direkt bei unseren Partnern bestellen.

Unser Umsatz entsteht über Affiliate-Provisionen — ohne Lager, Produktion oder Logistik.

## Phase 2 — Garmin Integration

Entwicklung einer Garmin Connect IQ App. Unsere Decision Engine begleitet den
Athleten bis ins Rennen. Die Uhr erinnert automatisch:

- trinken
- Gel einnehmen
- Elektrolyte
- Recovery

Der Athlet muss nicht mehr überlegen — nur noch laufen.

## Phase 3 — Ausbau der Decision Engine

Schrittweise Erweiterung der Plattform. Neue Datenquellen. Bessere Algorithmen.
KI-gestützte Auswertung von Produktbewertungen, wissenschaftlichen Erkenntnissen
und Nutzerfeedback.

Die Engine wird mit jedem Training intelligenter. Nicht durch Vermutungen. Sondern
durch Millionen echter Entscheidungen.

## Phase 4 — Internationale Skalierung

Expansion nach Europa. Danach weltweit. Die Physiologie kennt keine Landesgrenzen.
Lediglich die Produktdatenbank und Handelspartner unterscheiden sich. Dadurch lässt
sich das Geschäftsmodell international nahezu identisch ausrollen.

## Phase 5 — Eigene Produktlinie

Erst wenn wir genau verstehen, was Athleten wirklich brauchen, entwickeln wir unsere
eigene Marke. Keine Produkte aufgrund von Trends. Sondern Produkte, die aus Millionen
Empfehlungen und echten Erfahrungen entstehen.

Unsere Eigenmarke basiert auf Daten — nicht auf Bauchgefühl.

## Phase 6 — Strategischer Exit oder Lizenzmodell

Unser langfristiger Wert liegt nicht in der App. Unser Wert liegt in der Decision Engine.

Mögliche Zukunft:

- Lizenzierung der Engine an Garmin, COROS, Polar oder andere Wearable-Hersteller.
- Integration in Plattformen wie Strava oder TrainingPeaks.
- Oder vollständiger strategischer Verkauf der Technologie inklusive Nutzerbasis.

Die App ist der Einstieg. Die Engine ist das eigentliche Produkt.

## Phase 7 — Die Plattform

Sporternährung ist nur der Anfang. Sobald die Decision Engine bewiesen hat, dass sie
aus komplexen Daten präzise Handlungsempfehlungen ableiten kann, lässt sich das Modell
auf weitere Branchen übertragen.

Das eigentliche Unternehmen ist nicht Fuel Labs. Das eigentliche Unternehmen ist eine
universelle Decision Engine, die Menschen hilft, bessere Entscheidungen zu treffen.

Fueling ist lediglich der erste Anwendungsfall.

## Unsere Überzeugung

Die Zukunft gehört nicht den Unternehmen mit den meisten Daten.
Sie gehört den Unternehmen, die aus Daten die besten Entscheidungen ableiten.

---

# Where the code stands against Phase 1

An honest read, not a status report. Phase 1 is **a free Swiss app, three sports,
connect Garmin or Strava, import a race or a route, get a plan, order from partners,
revenue from affiliate commission.**

## Already there

| Phase-1 requirement | State |
| --- | --- |
| Connect Garmin or Strava | OAuth connect flow, state bound to the athlete; Strava, Garmin, Polar and Suunto adapters normalise into one activity model. |
| Personalised fueling plan | `src/engine` — carb g/h, fluid ml/h, sodium mg/L from body weight, session, intensity, conditions, sweat data, readiness. |
| Terrain-aware plan for a route | swisstopo height profile + MeteoSwiss conditions place feeds where the energy actually goes (Minetti cost of running). |
| Products from Swiss partners | Brand-neutral catalog (Sponser, Winforce, …) with a scoring engine that names a real product per slot. |
| It learns | Session logs tune a carb ceiling/bias; the debrief holds a past run against what the route demanded. |
| Swiss market | German + English, Swiss usage (ss, Sie), CHF, swisstopo, MeteoSwiss. |

## Four places the build and the vision disagree

These are decisions to make, not bugs. Each is cheap to change now and expensive later.

**1. The app is not free — it has three subscription tiers.**
`src/subscription` gates history depth, connected-provider count, load analytics
and export behind Base (CHF 0) / Pro (CHF 9) / Elite (CHF 19), with live Stripe
checkout for subscriptions. Phase 1 says free app, revenue from affiliate. Today a
Swiss runner on the free tier is capped at one connected service and 30 days of
history — precisely the limits that make the first plan feel thin. If Phase 1 holds,
the tiers should be switched off (not deleted — they are the Phase-6 B2B story) and
the gates opened.

**2. We are the merchant, not an affiliate.**
`src/commerce` builds our own cart and our own orders, and takes payment through our
own Stripe account. That means inventory questions, VAT, returns and support — the
"ohne Lager, Produktion oder Logistik" the vision explicitly rules out. Affiliate
needs the opposite: a partner link per product with attribution (`?ref=`), click
tracking, and a commission ledger. **None of that exists today.** The cart is the
single biggest piece of Phase-1 work still outstanding.

**3. There is no way to import a race or a planned route.**
Everything the platform reasons about is a *past, synced activity*. There is no GPX
or TCX upload, no route-URL import, no race entry. The vision's core Phase-1 moment
— *"importiert einen Wettkampf … und erhält sofort seinen Fueling-Plan"* — cannot
happen yet. The engine is ready for it (`planRouteFuelling` takes elevation samples,
not an activity), so this is an import path plus a screen, not new science.

**4. Swiss, but only two of four languages.**
German and English ship. Romandie and Ticino are roughly a quarter of the Swiss
market and get an English app. FR and IT are pure translation work — the i18n layer
already enforces key parity, placeholders and plurals.

## Scope the vision says to cut, that the build carries

- **Cycling and swimming** are first-class in the engine; Phase 1 says running, trail
  running, triathlon. (Triathlon needs both anyway — this may be deliberate.)
- **Team, coach, nutritionist and admin surfaces** with multi-tenant roles are built
  and maintained. Nothing in Phase 1 needs them; they are the Phase-6 B2B asset
  arriving five phases early, and every screen is a screen to keep working.

## What Phase 3 will need that today's loop cannot do

The engine learns **per athlete, from that athlete's own logs** — `deriveAdaptation`
reads the last eight sessions of one user. "Millionen echter Entscheidungen" needs
the opposite direction: outcomes pooled across users, so a product that reliably
causes GI distress at 90 g/h is known before *this* athlete finds out. That is a
different data model (anonymised outcome events, not per-user feedback rows) and it
is worth designing before the user base makes migration painful.

## The asset, stated plainly

Phase 6 says the engine is the product. Today it already is a clean, framework-free
TypeScript core (`src/engine`, `src/analysis`, `src/feedback`, `src/progress`) with
no UI or storage dependencies, reachable over HTTP at `/api/target`, `/api/recommend`,
`/api/schedule`, `/api/offering` and `/api/adaptation`. That is a licensable shape
already. What it lacks for a licensing conversation is versioning, a stable public
contract, rate limiting and per-tenant keys — none urgent, all worth not breaking.
