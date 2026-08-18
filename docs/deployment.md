# Deployment — run it anywhere

The app is a static SPA that reads its configuration **at runtime**, so a single
build artifact runs unchanged in dev, staging, production, and on-prem. You
reconfigure a deployment by editing `config.js`, not by rebuilding.

> **Swiss hosting** — Infomaniak, Exoscale, cloudscale.ch and the rest, plus
> what data still leaves the country and the go-live checklist:
> [`docs/hosting-switzerland.md`](./hosting-switzerland.md).

## Two checks, before and after

Every production deployment runs these. They are not documentation of good
intentions; both exit non-zero.

```bash
npm run preflight -- deploy/prod.env        # the configuration, before starting
npm run verify:deploy -- https://your-host  # the behaviour, once it is running
```

`preflight` (`src/preflight.ts`, unit-tested) refuses the development defaults
that are wrong in production: the signing key that ships in this repository, the
in-memory store, the demo role switcher — which the API honours as an
unauthenticated admin login — a plaintext SMTP password, a Stripe key with no
webhook secret. **The server runs it at start-up too**, and exits rather than
coming up misconfigured but healthy-looking.

`verify:deploy` reads the running deployment over HTTP: security headers, HSTS
and the HTTP→HTTPS redirect, that `config.js` is uncached and hashed assets are
not, that `/v1` refuses an unauthenticated call, and that `x-role: admin` is
refused — checked from outside, because the file you edited and the container
that is running are not always the same generation.

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
| operatorName | `OPERATOR_NAME` | — | Legal name of the controller, shown on Privacy & your data. **Required in prod.** |
| operatorAddress | `OPERATOR_ADDRESS` | — | Postal address; `\n` in the value becomes a line break. **Required in prod.** |
| privacyContact | `PRIVACY_CONTACT` | — | Email or form URL for access/erasure requests. **Required in prod.** |
| termsUrl | `TERMS_URL` | — | Where the sign-in screen's "our terms" actually points. |

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

### Render (one managed deploy — app + Postgres together) ⭐
`render.yaml` is a Blueprint that provisions **both** the web service and a
**managed Postgres** in one shot. Import the repo in Render (New → Blueprint) and
it: builds the SPA + API, creates the database, wires `DATABASE_URL` into the
service automatically, and generates `AUTH_SECRET`. The Node server serves the
built SPA and the API on **one origin** (`scripts/host-config.mjs` points the SPA
at `window.location.origin`), and Postgres migrations run on startup. Nothing to
patch or babysit — this is the fastest "fully managed, all in one place" path.

Optional secrets to set in the dashboard (all `sync: false`, dev stubs used if
unset): `STRAVA_*` / `GARMIN_*` for real OAuth, `GOOGLE_CLIENT_ID` /
`APPLE_CLIENT_ID` for real social sign-in.

**Databricks** stays a separate managed platform (it's analytics egress, not the
app's database — see below); launch with `EXPORT_ENABLED=false` and flip it on
later. If you want *all three under a single vendor*, see the two alternatives at
the end of this doc.

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

### Docker (any host / on-prem) ⭐
`Dockerfile` builds the **production image**: the SPA and the API served by one
Node process on one origin, so there is no CORS surface and no second deployment
to keep in step.

```bash
docker compose up --build                    # app on :8787, file-backed
docker compose --profile full up --build     # app + Postgres
docker compose --profile static up --build   # SPA only, behind nginx, :8080
```

For a real deployment use `deploy/compose/docker-compose.prod.yml`, which adds
Caddy for automatic Let's Encrypt TLS, keeps the app off a published port, and
takes its settings from a `prod.env` you have run `preflight` against. See
[`docs/hosting-switzerland.md`](./hosting-switzerland.md).

What the image does deliberately:

- **Configures at start, not at build.** The entrypoint writes `dist/config.js`
  from the runtime environment, so one tag is promoted from staging to
  production rather than rebuilt — an image that bakes its API URL is how
  staging ends up pointing at prod.
- **Runs the preflight before the server**, and exits non-zero on a blocker.
- **Non-root, under `tini`**, so SIGTERM reaches the graceful shutdown during a
  rolling deploy instead of cutting requests in flight.
- **Ships runtime dependencies only** (`npm ci --omit=dev`); `tsx` is a runtime
  dependency on purpose, so the server that runs in production is the same
  TypeScript the unit suite and the e2e journey exercise.

`Dockerfile.static` is the SPA-only nginx image, for hosting the front end
separately from the API.

### Elestio (managed VM in Europe — Hetzner, Scaleway, …) ⭐
`deploy/elestio/` runs the same image on a VM Elestio provisions and patches for
you, in a region you choose. It is `deploy/compose` minus the TLS layer: Elestio
terminates TLS at its own proxy, so the stack drops Caddy and binds the app to
the Docker bridge, where only that proxy can reach it.

```
Compose file path   deploy/elestio/docker-compose.yml   ← not the repo root
```

That path is the thing to get right: the root `docker-compose.yml` is the
*development* stack, and `ALLOW_ROLE_SWITCHING=true` in it serves any request
carrying `x-role: owner` as an owner.

Hetzner Falkenstein is the recommended target — cheapest of the European
options and ~10 ms from Zürich — but note it is Germany, not Switzerland, so
this deployment cannot make the claim
[`hosting-switzerland.md`](./hosting-switzerland.md) is written around. EEA and
FADP-adequate, so legally straightforward; a positioning call, not a technical
one. The README beside the compose file has the walkthrough, the region table,
and an explicit note on which two details could not be checked against Elestio's
own docs.

### Kubernetes
`deploy/kubernetes/` — plain manifests, `kubectl apply -k`. Two replicas, a
disruption budget, a startup/readiness/liveness split that tells "stuck" apart
from "cannot reach the database", and a `preStop` delay so a rolling deploy does
not serve 502s. See the README beside them.

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
   | `OPERATOR_NAME` / `OPERATOR_ADDRESS` / `PRIVACY_CONTACT` | who is responsible for the data (required) |
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

## Payments (Stripe)
Checkout is real and server-authoritative: `POST /api/checkout` creates a
**pending** order and returns the provider's payment URL; the order only becomes
**paid** when a **signature-verified webhook** arrives at
`POST /api/webhooks/payments` — the client is never trusted for money, and
settling is idempotent so repeated webhooks are safe. Paid subscription orders
move the user's tier automatically.

| Env | Why |
| --- | --- |
| `STRIPE_SECRET_KEY` | enables the real Stripe provider (test-mode key to rehearse) |
| `STRIPE_WEBHOOK_SECRET` | verifies webhook signatures (required with the key) |
| `STRIPE_API_BASE` | override the API host — used to drive the flow against a local double |

Point your Stripe webhook endpoint at `/api/webhooks/payments` and subscribe to
`checkout.session.completed` (plus the async success/failure events). Without
the keys the app uses a **simulated provider** that follows the identical server
path — same order lifecycle, same signed-webhook verification — so the purchase
flow is fully demoable offline.

### Verifying payments before you take money

```bash
npm run verify:payments                       # against a wire-accurate Stripe double
STRIPE_SECRET_KEY=sk_test_… \
STRIPE_WEBHOOK_SECRET=whsec_… npm run verify:payments   # against real Stripe, test mode
```

`scripts/stripe-verify.mjs` drives a whole purchase and asserts the rules that
actually matter: the request goes to `/v1/checkout/sessions` with a pinned API
version and an idempotency key, amounts are in rappen, the order starts
**pending**, a forged or replayed webhook changes nothing, a valid one settles it
exactly once, a late failure cannot reverse a paid order, and paying for a plan
raises the account's tier straight away. The double refuses anything Stripe would
refuse, so a wrong endpoint or a missing field fails there rather than on a
customer's first purchase.

The one thing neither mode covers is Stripe delivering a webhook to a public URL.
Before going live, run `stripe listen --forward-to <host>/api/webhooks/payments`
and complete one test-mode purchase with card `4242 4242 4242 4242`.

## Swiss geodata: maps, terrain and weather

All three are key-less public services, and all three degrade rather than fail,
so the app works offline — it just says so instead of pretending.

| Source | Used for | Fallback |
| --- | --- | --- |
| **swisstopo WMTS** (`wmts.geo.admin.ch`) | The base map for Swiss routes — national map, aerial, muted editions | OpenStreetMap tiles |
| **swisstopo profile API** (`api3.geo.admin.ch`) | Elevation profile, ascent, terrain class | Estimate from the activity's own elevation gain |
| **MeteoSwiss SwissMetNet** (`data.geo.admin.ch`) | *Measured* temperature, humidity and wind from the nearest station | ICON-CH model, then a seasonal estimate |

The weather panel names which of the three it used, because "13 °C" only helps an
athlete if they know whether it was measured 4 km away or guessed from the month.
swisstopo attribution is set on every tile layer — that is a licence condition,
not a nicety.

| Env | Why |
| --- | --- |
| `METEOSWISS_STATIONS_URL` | override the station feed URL (MeteoSwiss has been migrating its open-data platform) |

> **Verify before launch:** this repo's sandbox blocks `*.geo.admin.ch` and
> `api.open-meteo.com`, so the live responses could not be exercised here — the
> parsers, the source-selection chain and the fallbacks are unit-tested, and the
> app was confirmed to *request* swisstopo and MeteoSwiss first. Load the Connect
> tab once from an unrestricted network and check the weather panel reports
> "MeteoSwiss station" rather than "estimated".

## Transactional email
| Env | Why |
| --- | --- |
| `MAIL_SMTP_URL` | SMTP submission, e.g. `smtps://user%40host:pass@mail.infomaniak.com:465` |
| `MAIL_SMTP_STARTTLS` | upgrade a plain `smtp://` connection; defaults to on for port 587 |
| `MAIL_API_URL` / `MAIL_API_KEY` | an HTTP transactional provider instead |
| `MAIL_FROM` | sender address (default `no-reply@yougofurther.ch`) |
| `ALLOW_CONSOLE_MAIL` | ship without email sign-in, deliberately |

**SMTP is preferred where it is available.** Every HTTP transactional provider
(Resend, Brevo, Postmark, Mailgun) is a foreign company processing your athletes'
addresses; a Swiss deployment usually already has a Swiss mailbox, and the
built-in SMTP client (`src/auth/smtp.ts` — no dependency, implicit TLS and
STARTTLS, AUTH PLAIN/LOGIN, tested against a real socket) talks to it directly.
Any provider accepting a JSON `{from,to,subject,text}` POST still works.

Unset, the console mailer logs the link — which means nobody outside the
operations team can create an account, so the preflight treats it as a blocker
in production unless `ALLOW_CONSOLE_MAIL=true` says the choice was deliberate.

## Route map & network policy
The route map (`RouteMap`) is the **one feature that fetches from an external
host at runtime** — OpenStreetMap-based map tiles (CARTO dark by default). It is
open-source and needs no API key, but:
- On a restrictive **network policy** the tile host must be reachable, or the map
  shows the route/pins on a blank basemap (everything else still works).
- For **air-gapped / fully self-contained** deploys, self-host a tile server and
  point `TILE_URL` at it, or swap in your own basemap.

It is code-split, so it only loads when a route map is actually shown.

## Going further to production
- **Providers:** Strava & Garmin have real adapters; add the others by
  subclassing `BaseActivityProvider` with `exchangeToken` + `fetchActivities`.
  Set `*_CLIENT_ID/SECRET`.
- **App sign-in:** back `POST /api/auth/session` with real Google/Apple/email
  verification before signing the token (see `docs/auth.md`).
- **Warehouse:** implement `ActivityStore` for your warehouse and return it from
  `createStores()`.

## All three under one vendor (app + Postgres + Databricks)

Render (above) is fully managed but keeps Databricks separate. If the goal is a
single managed platform for **all three**, two options — no code changes, the app
is already portable (`DATABASE_URL` selects Postgres, Databricks is env-gated):

**Option A — one cloud (best for a public consumer app).** Pick a cloud and use
its managed services; Databricks is first-party on all three:

| Tier | Azure | AWS | GCP |
| --- | --- | --- | --- |
| App (SPA + API) | Container Apps / App Service | App Runner | Cloud Run |
| Postgres | Azure DB for PostgreSQL | Aurora Serverless v2 | Cloud SQL |
| Lakehouse | Azure Databricks | Databricks on AWS | Databricks on GCP |

The repo's `Dockerfile` + `docker-compose.yml` deploy the container tier; point
`DATABASE_URL` at the managed Postgres and set the `DATABRICKS_*` vars. Azure is
the tightest fit — Azure Databricks is a native first-party service (one portal,
SSO, VNet).

**Option B — Databricks-native, single vendor.** Databricks can host all three
itself: **Lakebase** (managed Postgres, Neon-based) as `DATABASE_URL`,
**Databricks Apps** to serve the container, and the **lakehouse** as the analytics
tier. One bill, one governance layer (Unity Catalog). Caveat: Databricks Apps is
tuned for *internal* data/BI apps behind workspace identity, not public B2C
signups + external OAuth at scale — great for a coach/enterprise-facing build,
weaker for a public consumer app. Confirm current GA status of Lakebase / Apps.
