# You Go Further — Mobile app (Expo / React Native)

A native iOS/Android app that is a **thin client of the You Go Further platform
API**. Because the phone and the web app call the same endpoints and feedback is
persisted per-user server-side, the two are genuinely **in sync**: log a session
on your phone and your plan updates on the web, and vice-versa.

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

| File | Purpose |
| --- | --- |
| `App.tsx` | Shell: live "in sync" connection banner + tab switch. |
| `src/api.ts` | Typed client for the platform API (recommend, schedule, feedback). |
| `src/types.ts` | Types mirroring the API responses. |
| `src/PlannerScreen.tsx` | Goal/session inputs → `/api/recommend` + `/api/schedule`. |
| `src/LogLearnScreen.tsx` | Reads/writes `/api/feedback` — the shared learning loop. |
| `src/theme.ts` | Shared palette matching the web brand. |

`npm run typecheck` type-checks the app against react + react-native.

## Sync — verified

Driving the platform through **this app's own `src/api.ts`** against a running
server: `health` ok, `recommend` returned targets, `schedule` returned the cue
list, and two GI-severe sessions logged from the mobile client produced a learned
carb ceiling that the web app reads back identically from the same account.

## Notes / next steps

- **Source of truth is the server**, so recommendations are always consistent with
  the web. For offline use, the pure `src/engine` from the web package can be
  shared into this app (via a workspace or Metro `watchFolders`) to compute
  locally and sync feedback when back online.
- Auth here uses the platform's `x-role` header for the demo; wire real sign-in
  (Expo AuthSession / OIDC) for production, matching the server's auth.
