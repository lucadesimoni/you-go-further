# End-to-end demo — backend, frontend, data analysis, admin

This proves the whole concept runs as an integrated system, not just isolated
modules. The **same** domain code (engine, analysis, data pipeline, RBAC) powers
both the browser app and the HTTP API — see `src/api/handlers.ts` (shared),
wrapped by `server/index.ts` (Node `http`).

## Run it

```bash
npm run build                                   # build the SPA
VITE_API_BASE_URL=http://localhost:8787 npm run build   # …pointed at the API
npm run server                                  # API + static app on :8787
# open http://localhost:8787  → Admin tab shows a live "Backend" panel
```

## Backend, over HTTP

```
GET  /api/health         → { status:"ok", environment, version, storeBackend, activitiesStored }
GET  /api/providers      → Strava/Garmin/Polar/Suunto descriptors + scopes
POST /api/recommend      → full recommendation (accepts measured physiology + adaptation)
POST /api/schedule       → timed in-session cue schedule
POST /api/target         → fueling targets only
POST /api/cart           → priced, shoppable cart from a recommendation × sessions
POST /api/adaptation     → learned carb ceiling/bias from logged session feedback
POST /api/ingest         → pull sample activities into the store (stateful)
GET  /api/activities     → query the store
GET  /api/analysis       → training load, ACWR, weekly buckets, nutrition demand
GET  /api/physiology     → readiness / HRV / resting HR from device wellness
GET  /api/admin/overview → org seats, members, plans, deployment  (RBAC: org:configure)
```

### Verified transcript

```
# stateful ingest across four providers
POST /api/ingest garmin → {"fetched":19,"inserted":19,"totalStored":19}
POST /api/ingest strava → {"totalStored":40}
POST /api/ingest polar  → {"totalStored":63}
POST /api/ingest suunto → {"totalStored":75}

# data analysis over the 75 stored rows
GET /api/analysis → { totalActivities:75, totalHours:107.5, weeks:[…], acwr:{…}, nutrition:{…} }

# personalized recommendation from measured body signals
POST /api/recommend {physiology:{sweatRateMlPerH:1500,sweatSodiumMgPerL:1100,readiness:35}}
  → carb/h 105 · fluid 1200 (measured) · sodium 1100 (measured)
  → note: "Hydration is set from your measured sweat rate (1500 ml/h)…"

# RBAC enforced server-side
GET /api/admin/overview  (x-role: athlete) → HTTP 403
GET /api/admin/overview  (x-role: admin)   → HTTP 200  seats:4, rows:75
```

## Frontend integration

Loading the app from the same server, the **Admin → Backend** panel calls
`/api/health` and `/api/admin/overview` live and renders the server's own state.
The browser network log shows `GET /api/health`, `GET /api/admin/overview`, and —
on "Seed sample data" — `POST /api/ingest`, which grew the shared store from 75 →
152 rows visible in the UI. Auth flows as an `x-role` header (a real deployment
swaps in SSO/JWT); the athlete role is refused the admin overview, the admin role
is served.

## Where the boundary is real vs. mocked
- **Real:** HTTP server, routing, JSON, CORS, stateful in-memory store, RBAC,
  and every computation (recommend/schedule/analysis/physiology).
- **Mocked:** provider *data* (sample generator instead of live OAuth calls) and
  the store backend (in-memory instead of a warehouse). Both are single-file swaps
  documented in `docs/architecture.md` / `docs/deployment.md`.
```
