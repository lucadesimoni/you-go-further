# Authentication

Two separate things, often confused:

1. **App login** — how a person signs in to *You Go Further* (Apple / Google / email).
2. **Provider connect** — linking a training service (Strava, Garmin, …) by
   authenticating **on the provider's own site** with that user's profile.

## 1. App login / registration

The app is gated behind a session (`src/App.tsx` → `LoginScreen`). Users choose:

- **Continue with Apple**
- **Continue with Google**
- **Continue with email** (register or sign in)

Session state lives in `src/auth/session.ts` (`Account` = a `Principal` + email +
auth provider), persisted client-side and cleared on **Sign out**. A demo-account
picker lets you explore the coach / nutritionist / admin views.

### Dev vs. production
Today social sign-in is a **simulated round-trip** so the app runs with no
credentials. The session shape and gating are production-final; only token
acquisition changes:

| Provider | Production wiring |
| --- | --- |
| Google | Google Identity Services (client id, ID-token in the browser) **or** a server OAuth callback that verifies the token. |
| Apple | Sign in with Apple — the server verifies the identity token and issues the session. |
| Email | Real sign-up + magic-link / password backed by the API and a user table. |

Swap the bodies of `signInWithProvider` / `signInWithEmail` in
`src/auth/session.ts` for the real provider verification. The **server-signed
session already exists**: `POST /api/auth/session` issues an HMAC token
(`src/auth/jwt.ts`) and the API authenticates `Authorization: Bearer <token>`
(falling back to the `x-role` demo header). RBAC (`src/auth/roles.ts`) and
per-user data (feedback, connections) key off the resulting principal. Set
`AUTH_SECRET` in production.

## 2. Provider connect (Strava implemented; others follow the pattern)

The OAuth flow is built end-to-end on the server:

| Endpoint | Purpose |
| --- | --- |
| `GET /api/oauth/:provider/start` | 302 → the provider's consent screen (real) or a dev stub. |
| `GET /api/oauth/:provider/dev-consent` | Local stand-in for the consent screen (dev only). |
| `GET /api/oauth/:provider/callback` | Exchange the `code` for tokens, import activities, store the connection, 302 back to the app. |
| `GET /api/oauth/:provider/authorize-url` | The real consent URL (for a custom client redirect). |
| `GET /api/connections` · `DELETE /api/connections/:provider` | List / disconnect. |

**All four providers have real adapters** (`src/providers/{strava,garmin,polar,
suunto}.ts`): OAuth token exchange + a real activities fetch mapped into our model
(each unit-tested with a mocked fetch). Per-user tokens live in a `ConnectionStore`
(`src/providers/connections.ts`).

To go **live**, register the app on each provider's portal and set the
credentials:

| Provider | Env | Notes |
| --- | --- | --- |
| Strava | `STRAVA_CLIENT_ID` / `STRAVA_CLIENT_SECRET` | OAuth2, `GET /athlete/activities`. |
| Garmin | `GARMIN_CONSUMER_KEY` / `GARMIN_CONSUMER_SECRET` | Real API is OAuth 1.0a + push; adapter keeps the normalized shape. |
| Polar | `POLAR_CLIENT_ID` / `POLAR_CLIENT_SECRET` | AccessLink `GET /v3/exercises`. |
| Suunto | `SUUNTO_CLIENT_ID` / `SUUNTO_CLIENT_SECRET` (+ `SUUNTO_SUBSCRIPTION_KEY`) | Cloud API `GET /v2/workouts`. |

With credentials set, "Connect" sends the user to that provider's real consent
page and imports their real activities. Without credentials the same flow runs in
**dev mode** (mock consent + sample data), so it's fully demoable. Validate the
field mappings against live responses before shipping.

In the UI, when the app is pointed at the API (`apiBaseUrl` set), the **Connect**
button initiates this OAuth flow; the client-side-only build keeps the sample
connect.

> Note: **Apple Health / Google Fit / Health Connect** are device-local health
> stores, not web OAuth — they're exposed through the **native mobile app**
> (HealthKit / Health Connect permissions), not the web app.
