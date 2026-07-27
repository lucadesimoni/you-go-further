# You Go Further — Mobile app (Expo / React Native)

A native iOS/Android app that is a **thin client of the You Go Further platform
API**. The phone and the web app call the same endpoints, and everything that
matters — profile, feedback, connections, insights, orders — is persisted per
user server-side, so the two are genuinely **one account**: log a session on your
phone and your plan updates on the web, and vice-versa.

```
mobile app ─┐
            ├─►  same HTTP API (server/index.ts)  ─►  one engine + per-user store
web app  ───┘
```

## Run it

```bash
# 1. Start the platform API (from the repo root)
npm run server                     # http://localhost:8787

# 2. Start the mobile app
cd mobile
npm install
EXPO_PUBLIC_API_BASE_URL=http://localhost:8787 npx expo start
# press i (iOS simulator), a (Android), or scan the QR with Expo Go
```

> On a physical device, point `EXPO_PUBLIC_API_BASE_URL` at your machine's LAN IP
> (e.g. `http://192.168.1.20:8787`) or a deployed API URL. The default is set in
> `app.json → extra.apiBaseUrl` and can be changed at runtime via `setApiBase()`.

## What's here

Five tabs, one navigation surface — personal screens live under **You**, so
nothing appears in two places.

| File | Purpose |
| --- | --- |
| `App.tsx` | Shell: session restore, connection banner, bottom tab bar. |
| `src/SignInScreen.tsx` | Passwordless sign-in via the server-verified magic link. |
| `src/PlannerScreen.tsx` | Session inputs → `/api/recommend` + `/api/schedule`, plus the reasoning. |
| `src/LogLearnScreen.tsx` | Reads/writes `/api/feedback` — the shared learning loop. |
| `src/InsightsScreen.tsx` | Fuelling score, milestones and the nutrition guide from `/api/insights` + `/api/guide`. |
| `src/CatalogScreen.tsx` | Product library with when-to-use guidance, cart and checkout. |
| `src/ProfileScreen.tsx` | Body & health data and account — synced through `/api/profile`. |
| `src/ConnectScreen.tsx` | Strava / Garmin / Polar / Suunto OAuth, opened in the system browser. |
| `src/api.ts` | Typed client; sends the signed session as a bearer token. |
| `src/session.ts` | Token + account persisted across launches (`src/storage.ts`). |
| `src/ui.tsx`, `src/theme.ts` | The shared building blocks and palette — the native side of the design system. |

`npm run typecheck` type-checks the app against react + react-native.

## Parity — verified

There is no simulator in CI, so the screens are rendered through
`react-native-web` (see `verify/`) at phone width and driven in a real browser
against a running API by `npm run e2e:mobile` from the repo root. That run
covers: magic-link sign-in, planning and re-planning, logging feedback, the
server-computed fuelling score, the guide, the catalog with its when-to-use
guidance, building a cart, saving the profile and having it flow back into the
plan, and the connections screen — with zero console, page or HTTP errors.

Numbers are never recomputed on the phone: `/api/insights` returns the same
progress and fuelling score object the web app renders, so the two clients
cannot drift.

## Notes / next steps

- **Source of truth is the server.** For offline use, the pure `src/engine` from
  the web package can be shared into this app (via a workspace or Metro
  `watchFolders`) to compute locally and sync feedback when back online.
- The OAuth consent screen and Stripe checkout open in the system browser and
  return through the `yougofurther://` scheme (registered in `app.json`);
  `App.tsx` handles the incoming link — redeeming `?magic=` sign-in tokens and
  landing on the right screen after `?connected=` or `?paid=`.
- Apple Health and Google Fit still need their native SDKs; the profile already
  carries `syncedFrom` for when they land.
