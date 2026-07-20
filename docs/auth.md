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

### Real Google / Apple sign-in (implemented)
The secure flow is built end to end:

1. **Client** runs the provider's real flow when a client id is configured
   (`googleClientId` / `appleClientId`) and an API is reachable
   (`src/auth/oidcClient.ts`): Google Identity Services / Sign in with Apple JS
   return an **ID token**.
2. **Server** verifies that ID token against the provider's published public keys
   (JWKS, RS256) and checks issuer + audience + expiry
   (`src/auth/oidcVerify.ts`), then issues our HMAC session
   (`POST /api/auth/google`, `POST /api/auth/apple` → `{ token }`).
3. The client stores the token; the API client sends `Authorization: Bearer
   <token>` (preferred over the `x-role` demo header). `GET /api/me` returns the
   verified principal.

**To enable it:** register the app and set the client ids
(`VITE_GOOGLE_CLIENT_ID`, `VITE_APPLE_CLIENT_ID` for the browser; matching
`GOOGLE_CLIENT_ID` / `APPLE_CLIENT_ID` on the server for the audience check) and
`AUTH_SECRET`. Without client ids the buttons fall back to the **simulated**
identity so the demo runs with no credentials.

The verification is unit-tested with a self-signed keypair (valid token accepted;
tampered / expired / wrong-audience / wrong-issuer / unknown-key rejected) and an
end-to-end endpoint test (real-shape token → verified → session).

> Apple omits the user's name from the token after the first sign-in; the client
> passes it alongside the token when present. **Email** login is still a demo
> stub — back it with a real sign-up / magic-link for production.

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
