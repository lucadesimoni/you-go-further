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
| storeBackend | `VITE_STORE_BACKEND` | `memory` | `memory` or `warehouse`. |
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

## Going to a real backend
- **Providers:** implement a real `ActivityProvider` per service (token exchange +
  API calls) and register it in `src/runtime.ts`; set `*_CLIENT_ID/SECRET` env.
- **Storage:** implement `ActivityStore` against your warehouse and return it from
  `createStore()` when `storeBackend === "warehouse"`.
- **Auth:** replace `src/personas.ts` with principals from your IdP (OIDC/SSO);
  the RBAC in `src/auth` already enforces per-role permissions.
