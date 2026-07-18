# Platform Architecture

The platform is organized as framework-agnostic TypeScript modules under `src/`,
with a thin React/Vite UI on top. Every module has a single responsibility and a
clean interface, so backends (real provider APIs, a warehouse) drop in without
touching the UI or the nutrition logic.

```
providers ──► data (ingest + store + export) ──► analysis ──► engine (nutrition)
    ▲                                                              ▲
    └──────────────── model (shared Activity) ─────────────────────┘
                         subscription (feature gating, cross-cutting)
```

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
Unchanged core from the initial foundation; see `nutrition-spec.md`.

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

## Testing
`npm test` — 35 Vitest cases across engine, analysis, data pipeline (registry,
dedup, concurrent ingest, export), and subscription gating.

## Honest status
Connectors and the store are production-shaped **interfaces with a working mock**
implementation: OAuth URLs are real, but token exchange, live API calls, and a
real warehouse backend are the documented next step. Sample activity data is
clearly labelled as such in the UI.
