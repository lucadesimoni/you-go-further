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

### GitHub Codespaces
`.devcontainer/devcontainer.json` provisions Node 22 + Docker-in-Docker and runs
`npm install` on create. Open the repo in a Codespace, then:

```bash
npm run dev     # Vite dev server on 5173 (auto-forwarded)
npm test        # watch/CI tests
```

### Docker (any host / on-prem)
```bash
docker compose up --build          # serves on http://localhost:8080
# or, sub-path hosting:
docker build --build-arg BASE_PATH=/app -t you-go-further .
docker run -p 8080:80 you-go-further
```
The image is a multi-stage build → nginx with SPA fallback, asset caching, a
`no-store` rule for `config.js`, and a healthcheck.

### Static hosts (Vercel / Netlify / S3+CloudFront / GitHub Pages)
```bash
npm run build   # outputs dist/
```
Serve `dist/` with an SPA fallback to `index.html`. For a sub-path (e.g. GitHub
Pages project site), build with `BASE_PATH=/<repo>/`.

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

Set `EXPORT_ENABLED=true` and the Databricks env vars to stream every ingested
activity into a Databricks table via the SQL Statement Execution API
(`src/data/databricksSink.ts`):

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
