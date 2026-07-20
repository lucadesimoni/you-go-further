# Deployment — run it anywhere

The app is a static SPA that reads its configuration **at runtime**, so a single
build artifact runs unchanged in dev, staging, production, and on-prem. You
reconfigure a deployment by editing `config.js`, not by rebuilding.

## Configuration

Resolution order (highest wins): `window.__APP_CONFIG__` (from `public/config.js`)
→ `VITE_*` / env vars → defaults. See `src/config.ts`.

| Key | Env var | Default | Purpose |
| --- | --- | --- | --- |
| environment | `VITE_APP_ENV` | `development` | Label shown in UI/footer. |
| basePath | `BASE_PATH` | `/` | Sub-path hosting (build-time for asset URLs). |
| apiBaseUrl | `VITE_API_BASE_URL` | `""` | REST API base; empty = client-side mock mode. |
| storeBackend | `VITE_STORE_BACKEND` | `memory` | `memory` · `file` · `postgres` · `warehouse`. |
| dataDir | `VITE_DATA_DIR` | `./.data` | Directory for the `file` backend. |
| databaseUrl | `DATABASE_URL` | — | Postgres connection string (server-only; implies `postgres`). |
| authSecret | `AUTH_SECRET` | dev secret | HMAC secret for signed sessions — **set in prod**. |
| enabledProviders | `VITE_ENABLED_PROVIDERS` | all four | CSV of `strava,garmin,polar,suunto`. |
| exportEnabled | `VITE_EXPORT_ENABLED` | `false` | Attach an export sink. |
| defaultTier | `VITE_DEFAULT_TIER` | `free` | Starting subscription tier. |
| allowRoleSwitching | `VITE_ALLOW_ROLE_SWITCHING` | `true` | Demo persona switcher (turn **off** in prod). |

Runtime override example (`config.js`, no rebuild):

```js
window.__APP_CONFIG__ = {
  environment: "production",
  apiBaseUrl: "https://api.yougofurther.example",
  storeBackend: "warehouse",
  allowRoleSwitching: false,
};
```

## Targets

### GitHub Codespaces (one-click live deploy)
`.devcontainer/devcontainer.json` provisions Node 22, runs `npm install`, and on
attach **auto-starts the app** (`npm run codespace`) — build + a file-backed API
server on port **8787**, forwarded **public** with a preview. Because
`npm run codespace` writes a `dist/config.js` that points `apiBaseUrl` at
`window.location.origin`, the SPA runs in full API mode behind the Codespace's
dynamic URL: login, OAuth connect, signed sessions, and durable (file) storage
all work. Share the forwarded 8787 URL to give someone a live instance.

```bash
npm run codespace   # build + serve (app + API) on :8787  — runs automatically on attach
npm run dev         # Vite dev server on 5173 (hot reload)
npm test            # tests
```

> Set provider credentials (`STRAVA_*`, …) and `AUTH_SECRET` as Codespace secrets
> for real OAuth + non-dev sessions; without them the flow runs in dev mode.

### Docker (any host / on-prem)
```bash
docker compose up --build          # serves on http://localhost:8080
# or, sub-path hosting:
docker build --build-arg BASE_PATH=/app -t you-go-further .
docker run -p 8080:80 you-go-further
```
The image is a multi-stage build → nginx with SPA fallback, asset caching, a
`no-store` rule for `config.js`, and a healthcheck.

### Vercel (full stack — SPA + serverless API)
The repo is deploy-ready for Vercel: `vercel.json` builds the Vite SPA to `dist/`
and routes `/api/*` to a single serverless function (`api/[...path].ts`), which
wraps the exact same `createApiRouter()` the Node server uses. Import the repo in
Vercel (or `vercel --prod`) and it builds with no extra setup.

Two things matter for a *functional* deploy:

1. **Use Postgres, not the file backend.** Serverless invocations are ephemeral
   and don't share a disk, so `file` won't persist. Add a database (Vercel
   Postgres / Neon / Supabase) and set `DATABASE_URL` — config auto-selects the
   `postgres` backend and migrations run lazily on the first request.
2. **Set the secrets** as Vercel environment variables:

   | Env | Why |
   | --- | --- |
   | `DATABASE_URL` | durable store (required) |
   | `AUTH_SECRET` | signs sessions — `openssl rand -hex 32` |
   | `STRAVA_CLIENT_ID` / `STRAVA_CLIENT_SECRET` | real Strava OAuth (optional) |
   | `GARMIN_CLIENT_ID` / `GARMIN_CLIENT_SECRET` | real Garmin OAuth (optional) |
   | `VITE_GOOGLE_CLIENT_ID` / `VITE_APPLE_CLIENT_ID` | real Google/Apple sign-in (optional) |
   | `VITE_ENABLED_PROVIDERS` | e.g. `strava,garmin,polar,suunto` |

   The SPA calls the API on its own origin (relative `/api/*`), so no
   `VITE_API_BASE_URL` is needed. Provider/social vars are optional — without them
   the flows fall back to the built-in dev stubs.

Databricks is **not** required for a first functional app — see below; it's an
analytics egress you enable later with a single set of env vars.

### Other static hosts (Netlify / S3+CloudFront / GitHub Pages)
```bash
npm run build   # outputs dist/
```
Serve `dist/` with an SPA fallback to `index.html`. These host the SPA only; pair
with the Node/Docker API (or Vercel functions) for the backend. For a sub-path
(e.g. GitHub Pages project site), build with `BASE_PATH=/<repo>/`.

### Node preview
```bash
npm run build && npm run preview   # http://localhost:4173
```

## CI
`.github/workflows/ci.yml` runs typecheck → test → build (uploads `dist/`) and a
Docker image build on every push/PR.

## Persistence backends

| Backend | Durable? | Use |
| --- | --- | --- |
| `memory` | no | dev / demo (default) |
| `file` | yes (JSON files in `dataDir`) | single-node, small deployments, no DB |
| `postgres` | yes | production — set `DATABASE_URL` |
| `warehouse` | — | analytics offload (stub) |

The composition root (`src/runtime.ts`) picks the store set; the API server runs
`runtime.init()` (Postgres migrations) at startup. Full stack locally:

```bash
AUTH_SECRET=$(openssl rand -hex 32) docker compose --profile full up --build
# → Postgres + API (migrations run automatically) + SPA on :8787
```

## Sessions
`POST /api/auth/session` issues an HMAC-signed token (see `src/auth/jwt.ts`); the
server accepts `Authorization: Bearer <token>` and falls back to the `x-role`
demo header otherwise. Set `AUTH_SECRET` in production.

## Big-data export (Databricks)

This is an **analytics egress, not the app's database** — the app serves entirely
from the transactional store (Postgres). It's an add-on you enable once data is
flowing, not a launch dependency, so a first functional deploy can ship without
it. When you're ready, set `EXPORT_ENABLED=true` and the Databricks env vars to
stream every ingested activity into a Databricks table via the SQL Statement
Execution API (`src/data/databricksSink.ts`):

| Env | Example |
| --- | --- |
| `DATABRICKS_HOST` | `https://dbc-xxxx.cloud.databricks.com` |
| `DATABRICKS_TOKEN` | (PAT / service-principal token) |
| `DATABRICKS_WAREHOUSE_ID` | `abc123…` |
| `DATABRICKS_TABLE` | `main.default.activities` |

Unconfigured, the sink no-ops (dev). The `ExportSink` interface also has
NDJSON / columnar helpers for S3/Parquet, Kafka, or another lakehouse.

## Going further to production
- **Providers:** Strava & Garmin have real adapters; add the others by
  subclassing `BaseActivityProvider` with `exchangeToken` + `fetchActivities`.
  Set `*_CLIENT_ID/SECRET`.
- **App sign-in:** back `POST /api/auth/session` with real Google/Apple/email
  verification before signing the token (see `docs/auth.md`).
- **Warehouse:** implement `ActivityStore` for your warehouse and return it from
  `createStores()`.
