# Fuel Labs — Vision & Roadmap

> The vision below is kept **verbatim, in the founder's own words** — including
> its spelling of *Fueling*. Translating or copy-editing it would blunt it. The
> assessment that follows is in English, like the rest of these docs, follows the
> house style (*fuelling*), and is written against what the code actually does.
>
> **Fuel Labs** is the company; **You Go Further** is the product. This is the one
> document that speaks as the company — everywhere an athlete can see, the brand
> is You Go Further.

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

> **Status:** the four Phase-1 gaps this document originally named are closed, and
> what remains before a launch is commercial rather than technical — signing the
> brand agreements that turn the outbound links from untracked into earning.
> Phase 3's cross-athlete learning and Phase 6's licensable contract are built;
> Phase 2 needs a Garmin developer account and a Monkey C app, which do not live
> in this repository.

## Already there

| Phase-1 requirement | State |
| --- | --- |
| Connect Garmin or Strava | OAuth connect flow, state bound to the athlete; Strava, Garmin, Polar and Suunto adapters normalise into one activity model. |
| Personalised fuelling plan | `src/engine` — carb g/h, fluid ml/h, sodium mg/L from body weight, session, intensity, conditions, sweat data, readiness. |
| Terrain-aware plan for a route | swisstopo height profile + MeteoSwiss conditions place feeds where the energy actually goes (Minetti cost of running). |
| Products from Swiss partners | Brand-neutral catalog (Sponser, Winforce, …) with a scoring engine that names a real product per slot. |
| It learns | Session logs tune a carb ceiling/bias; the debrief holds a past run against what the route demanded. |
| Swiss market | German, French, Italian + English; Swiss usage (ss, Sie/vous/Lei), CHF, swisstopo, MeteoSwiss. |

## The four gaps — now closed

All four were addressed; each stayed a **switch**, not a rewrite, so the old
behaviour is still there for the phases that need it.

**1. The app is free.** `subscriptionsEnabled` defaults to `false`, and
`effectiveTier()` then serves every athlete the full feature set: four connected
services, five years of history, load analytics, export. The billing screen and
its menu entry disappear rather than sitting there unreachable. The plans, the
gating and the Stripe subscription flow are all untouched in the code — Phase 6
turns them back on with one flag.

**2. We are an affiliate, not the merchant.** `src/commerce/affiliate.ts` builds
outbound links to the brand's own shop with attribution (`?ref=…&subid=…`), and
every hand-off is recorded in an `AffiliateStore` so a partner's commission
statement can be reconciled against what we actually sent. Three rules keep it
honest:

- **No invented publisher ids.** Programs are admin-configured and empty by
  default. A brand with no agreement still gets a link — the athlete is sent to
  the right product either way — marked untracked, earning nothing.
- **The server decides what can earn.** A client claiming a click is tracked is
  ignored; only a configured program makes it so.
- **We say what we earn.** The cart states plainly that partner orders pay us a
  commission at no extra cost, or that this particular brand pays us nothing.

The direct-sale cart and Stripe checkout remain behind `sellDirect`, for B2B and
an eventual house brand.

**3. A race can be imported before it is run.** `src/geo/gpx.ts` parses the GPX
every organiser publishes — tolerant of namespaces, attribute order, CRLF,
self-closing points and missing elevation — and `RaceImport` turns it into the
course map, the swisstopo terrain, the weather, and the height-profile fuelling
plan with a real product named at each stop. Duration starts from distance and
climbing (a flat pace plus ~10 s per 10 m of ascent) and the athlete corrects it;
the plan follows their target, not our model. The file never leaves the device —
only the route line is sent on, for terrain and weather.

**4. Swiss means four languages.** French and Italian ship alongside German and
English, formal address throughout to match, with `detectLang` serving Romandie
and Ticino their own language instead of English. The guard tests now run per
locale: key parity, placeholder parity, no accidental copies of the English
string, no stray non-Latin characters, no empty values, plus accent checks that
catch a machine-mangled dictionary. Romanche is deliberately out: ~40 000
speakers who all also read German, and a half-maintained translation is worse
than none.

## Scope the vision says to cut, that the build carries

- **Cycling and swimming** are first-class in the engine; Phase 1 says running, trail
  running, triathlon. (Triathlon needs both anyway — this may be deliberate.) The
  race importer offers running, trail and triathlon first, with cycling available.
- **Team, coach, nutritionist and admin surfaces** with multi-tenant roles are built
  and maintained. Nothing in Phase 1 needs them; they are the Phase-6 B2B asset
  arriving five phases early, and every screen is a screen to keep working.

## Phase 3 — the second direction of learning, now built

The engine used to learn **only per athlete, from that athlete's own logs**.
"Millionen echter Entscheidungen" needs the opposite direction too: outcomes
pooled across users, so a rate that reliably causes GI distress is known before
*this* athlete finds out.

`src/analysis/cohort.ts` is that model — deliberately a different one, anonymous
outcome observations rather than per-user feedback rows, so it never becomes a
way to read one athlete's history. Three rules make it defensible: nothing
identifying leaves the store, a rate band stays silent below twelve observations,
and proportions carry a **Wilson interval** rather than a bare percentage,
because "3 of 4" is not 75 %. An observation is only recorded when the athlete
reported what they *actually* took — using the planned rate would make the cohort
agree with our own advice and learn nothing.

The athlete's own logs still win when they exist. The cohort is what a *first*
plan starts from, instead of the middle of the range.

**Still ahead for Phase 3:** the vision also names AI-assisted reading of product
reviews and published research. Nothing of that is built, and it should not be
faked — a claim sourced from a language model reading a review is not the same
kind of thing as a claim sourced from Minetti or Jeukendrup, and the engine's
credibility rests on never mixing the two silently.

## The asset, stated plainly

Phase 6 says the engine is the product. It is a clean, framework-free TypeScript
core (`src/engine`, `src/analysis`, `src/feedback`, `src/progress`) with no UI or
storage dependencies — a property now enforced by a test rather than a habit, so
it cannot quietly acquire one.

The four things this section used to list as missing for a licensing conversation
are built:

| Was missing | Now |
| --- | --- |
| Versioning | `src/version.ts` — a version per module and one for the platform, served by `GET /api/version`. |
| A stable public contract | **`/v1`** (`docs/public-api.md`) — its own `CONTRACT_VERSION`, flattened responses, and golden tests that fail if a field disappears. |
| Rate limiting | A per-key token bucket. |
| Per-tenant keys | Scoped, revocable, hashed at rest, with usage metered per key per endpoint per day. |

`/v1` is deliberately separate from the app's own `/api/*`: our routes may change
whenever the app does, and a partner's cannot. It answers purely from the request
body — no athlete identity, no storage, no history — which is what makes it
embeddable in someone else's product without dragging our database along, and
means integrating does not hand us their users.

**This is also Phase 2's groundwork.** A Garmin Connect IQ app is exactly a
third-party client calling the engine over HTTP, and `/v1/plan` already returns
the flat, time-ordered cue list a watch counts down to. What remains for Phase 2
is the Monkey C application itself and a Garmin developer account — neither of
which lives in this repository.
