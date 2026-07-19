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
`src/auth/session.ts` for the real flow and issue a server-signed session
(JWT). RBAC (`src/auth/roles.ts`) and per-user data (feedback, connections)
already key off the account.

## 2. Provider connect (Strava, Garmin, Polar, Suunto)

Each provider has its **real** OAuth authorize/token endpoints and scopes
(`src/providers/descriptors.ts`), and `authorizeUrl()` builds a genuine consent
URL. What's still needed to make "Connect" real:

1. `GET /api/oauth/:provider/start` → redirect the user to the provider's consent
   page (they log in **with their own profile** there).
2. `GET /api/oauth/:provider/callback` → exchange the `code` for tokens.
3. Store per-user tokens (with refresh) and implement `fetchActivities` against
   the provider REST API instead of the sample generator.
4. Register the app on each provider portal and set `*_CLIENT_ID` / `*_SECRET`.

Until then, connecting ingests sample data attributed to the signed-in account.

> Note: **Apple Health / Google Fit / Health Connect** are device-local health
> stores, not web OAuth — they're exposed through the **native mobile app**
> (HealthKit / Health Connect permissions), not the web app.
