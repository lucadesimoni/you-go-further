# Platform Architecture

The platform is organized as framework-agnostic TypeScript modules under `src/`,
with a thin React/Vite UI on top. Every module has a single responsibility and a
clean interface, so backends (real provider APIs, a warehouse) drop in without
touching the UI or the nutrition logic.

```
providers ──► data (ingest + store + export) ──► analysis ──► engine (nutrition)
    ▲                                                              ▲
    └──────────────── model (shared Activity) ─────────────────────┘

config ──► runtime (composition root) ──► wires providers + store + sinks
auth (RBAC) + subscription (tiers)  ──► cross-cutting access control
```

The **composition root** (`src/runtime.ts`) reads `src/config.ts` and constructs
the concrete store/providers/sinks. Nothing else instantiates a backend directly,
so switching from in-memory to a warehouse — or enabling a subset of providers —
is a config change. Config itself resolves from `window.__APP_CONFIG__` (injected
at deploy time) → env → defaults, which is what makes "build once, run anywhere"
work. Access is enforced on two axes: **RBAC** (`src/auth`) decides what a *user*
may do, **subscription** (`src/subscription`) decides what the *account* has paid
for.

## Modules

### `src/model.ts` — shared domain
The provider-neutral `Activity` shape every layer speaks. Adding a provider or a
storage backend never changes it.

### `src/providers/` — device & service connectors
- `ActivityProvider` interface + `BaseActivityProvider` (builds the **real**
  OAuth authorize URL from each provider's published endpoints/scopes).
- `DESCRIPTORS` — Strava, Garmin, Polar, Suunto: OAuth config (client id/secret
  read from env, never hard-coded), capabilities, and sync notes.
- `ProviderRegistry` — lookup by id.
- `sampleData.ts` — deterministic sample activities so the whole stack runs and
  is testable **without credentials**. A real adapter overrides `fetchActivities`
  to call the provider API and normalize the response into `Activity`.

**Going live:** implement a subclass per provider that performs the token
exchange and calls the REST API, then register it in place of the base provider.
Set the `*_CLIENT_ID` / `*_CLIENT_SECRET` env vars.

### `src/data/` — big-data connectivity
- `ActivityStore` — backend-neutral storage contract; `InMemoryActivityStore`
  is the reference. A production build swaps in BigQuery/ClickHouse/Postgres.
- `ExportSink` — the seam for streaming rows to a warehouse/lake/event bus.
  `BufferSink` + `toNdjson` / `toColumnarRows` helpers included.
- `IngestionPipeline` — orchestrates fetch → normalize → store (de-dup on
  `Activity.id`) → fan-out to sinks. `ingestAll` runs providers concurrently.

### `src/analysis/` — training analytics
- Intensity inference from HR, TRIMP-style `sessionLoad` (prefers a
  provider-supplied training load).
- `weeklyBuckets`, and `acwr` — the acute:chronic workload ratio with a
  status flag (detraining / optimal / caution / high-risk).
- `nutritionDemand` — runs the nutrition engine over each session to aggregate
  weekly carbohydrate needs. This is where analysis feeds fueling.
- `analyze` — one-shot report.

### `src/engine/` — nutrition recommendations
Core recommendation engine; see `nutrition-spec.md`. `offering.ts` is the
transparent scoring algorithm that decides *which product, when* — it fills the
plan's functional slots (carrier / top-up / electrolyte / hydration / pre /
recovery), scoring every catalogue item 0–100 with reasons; `recommend()`
delegates all product selection to it, and `POST /api/offering` exposes it
directly. `recommend(input, catalog)`
takes an injectable product catalog so admin/house products flow into plans, and
every `PhasePlan` carries a plain-language `rationale[]` explaining which
ingredients and combo were picked and why (surfaced in a collapsible "Why these"
in the planner). `productStore.ts` adds the **admin product library**:
`normalizeProduct` (Swiss-only validation), `mergeCatalog` (custom overrides/adds
on top of the built-in Swiss brands), and an `InMemoryProductStore`; File/Pg
implementations live in `src/persistence`. The library is served at
`/api/products` (browse merged catalog; `catalog:edit` gates add/override/delete).

### Route map (`src/components/RouteMap.tsx`)
A real slippy map (Leaflet + OpenStreetMap data) of an activity's GPS track with
fuelling stops pinned along it. Open-source stack, **no API key**; the dark
basemap uses CARTO's OSM-based tiles (`TILE_URL`, swappable for standard OSM or a
self-hosted server). It is **code-split** — Leaflet (~44 KB gz) loads only when a
route map is shown, keeping the main bundle lean — and is the one feature that
fetches from an external host at runtime (map tiles); everything else is
self-contained. Sample GPS tracks are synthesized around real Swiss trailheads in
`providers/sampleData.ts` until a provider account is linked.

### `src/subscription/` — Abo tiers & gating
- `PLANS` (Base / Pro / Elite) as data; every gated capability is a field on
  `PlanFeatures`.
- `can` / `limit` / `requiredTierFor` / `assertFeature` — one source of truth the
  UI and pipeline both check.

| Feature | Base (free) | Pro (CHF 9) | Elite (CHF 19) |
| --- | --- | --- | --- |
| Connected services | 1 | 4 | 4 |
| History | 30 d | 1 yr | 5 yr |
| Auto-sync | — | ✓ | ✓ |
| Load analytics (ACWR, trends) | — | ✓ | ✓ |
| Data export | — | — | ✓ |
| AI insights | — | — | ✓ |

## UI (`src/App.tsx`, `src/components/`)
Two tabs — **Fuel planner** (the engine) and **Connect & analyse** (the
dashboard) — with a subscription tier bar. The dashboard drives the real
`IngestionPipeline` + `InMemoryActivityStore`, and gates provider slots,
analytics and export through the `subscription` module.

All styling flows from a single **design system** — one token set (colour,
spacing, radius, type, elevation, motion) defined in `src/styles.css` and consumed
by shared primitives (`.panel`, `.btn`, `.badge`, `.tag`, `.pill`, `.stat`,
disclosures, form controls). No component hard-codes a colour or radius. See
`docs/design-system.md`.

## Testing
`npm test` — 35 Vitest cases across engine, analysis, data pipeline (registry,
dedup, concurrent ingest, export), and subscription gating.

## Honest status
Connectors and the store are production-shaped **interfaces with a working mock**
implementation: OAuth URLs are real, but token exchange, live API calls, and a
real warehouse backend are the documented next step. Sample activity data is
clearly labelled as such in the UI.
