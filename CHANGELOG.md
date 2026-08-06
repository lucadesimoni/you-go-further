# Changelog

Releases of the You Go Further platform. Individual modules carry their own
versions — see [`docs/modules.md`](docs/modules.md) for the rule and
[`src/version.ts`](src/version.ts) for the manifest. `GET /api/version` reports
both from a running deployment.

The platform version answers "which release is this?". A module version answers
"has this module's contract changed?". They move independently, on purpose.

## 0.6.0

API hardening. Four defects that only show up under load or under attack, none
of them visible from a passing test suite.

**Fixed**

- **Unbounded request bodies.** Both transports streamed a POST body into memory
  with no ceiling — one request could exhaust the process. Capped at 1 MB, well
  above the largest legitimate payload (an elevation profile), with a 413. The
  first attempt at this was itself wrong: destroying the socket before flushing
  the response meant the client saw only an interim `100 Continue` and a dead
  connection, indistinguishable from a crash. Verified over real HTTP, with and
  without `Expect: 100-continue`.
- **500 responses handed out internal failure text.** `e.message` carries
  whatever the failure happened to say: a Postgres error carries the query and
  the host, a filesystem error a path. The caller now gets `internal_error` and a
  reference; the detail goes to the log tagged with the same reference, so a
  support question stays answerable.
- **The sign-in endpoint was a membership oracle.** Answering "registration is
  closed" only to unknown addresses let anyone type an email and learn whether
  that person has an account. The reply is now identical either way — the only
  difference is whether mail arrives, which only the address's owner can see.
- **No rate limit anywhere on `/api/*`.** Asking for a sign-in link sends real
  mail to an address the caller chose, so unlimited it is a way to flood a
  stranger's inbox on our sending reputation. Now limited — and limited by
  **inbox**, not by source address: a first attempt keyed on IP was caught by the
  e2e starving its own sign-in, which is exactly what a university, a company or
  a mobile carrier behind one NAT would have experienced. Three per address per
  minute, thirty per source. Ingest and checkout are limited per athlete.

**Added**

- `ApiResponse.headers`, so the router can set `Retry-After` — the number was
  already in the 429 body, where no HTTP client, proxy or CDN looks for it. Both
  the app API and `/v1` now send it.
- `ApiRequest.clientIp`, resolved by each transport. `x-forwarded-for` is trusted
  only when `TRUST_PROXY=true`, because a client can set that header itself and
  trusting it blindly hands every attacker a fresh bucket per request — worse
  than no limit, because it looks like protection.

630 unit tests, 43 e2e steps and the mobile parity smoke pass.

## 0.5.0

Import, tested against each provider's own payload shape instead of against our
idea of it. Ten defects found, every one of which would have corrupted or lost
real athlete data on the first live sync.

**What could not be tested.** No call was made to a live Strava, Garmin, Polar or
Suunto API. This environment blocks every provider host, and a live check also
needs a registered developer application per provider and a real athlete's OAuth
consent. `npm run verify:providers` is the script that does that run wherever
those exist; it reports a provider with no token as **skipped, not passed**. See
`docs/provider-import.md`.

**Fixed — import**

- **Garmin returned every session as sport "other" and dated today.** The
  normaliser read only the internal web API's `{ typeKey }` and `startTimeGMT`,
  while the official Health API sends a string `activityType` and
  `startTimeInSeconds`. Both shapes are read now, and the epoch is already UTC so
  the local offset is not added to it. Ascent was dropped for the same reason
  (`totalElevationGainInMeters`).
- **Polar sessions landed in the wrong timezone.** `start-time` is local wall
  clock with the zone in a separate `start-time-utc-offset`, so parsing the
  string alone made the runtime guess — a Swiss athlete's summer sessions came
  out two hours off, some on the wrong day. Polar's own `training-load` was also
  discarded and then recomputed, worse, from averages.
- **Suunto heart rates were in hertz.** An average of 2.6 does not throw; it
  quietly ruins every intensity inference, training load and fuelling target
  downstream. Suunto's numeric sport enum was also unread, so every workout was
  "other".
- **Strava truncated at 100 activities and never refreshed its token.** A backfill
  silently lost everything past the first page, which looks exactly like "they
  did not train much"; and since an access token lasts six hours, the first sync
  of the day worked and every one after it failed with a 401. Both fixed, plus a
  429 now returns a partial sync rather than throwing the whole thing away.

**Fixed — sample data**

Speed was drawn independently of duration, producing a 3.5-hour run at 4:24/km
over 48 km and a 100 km Swiss ride with 254 m of climbing — in the data the demo,
the screenshots and every e2e run are judged on. Pace now decays with duration,
ascent is Swiss and scales with distance, a swim stays a swim, and some sessions
have no GPS at all, because real weeks have them and the app has to meet one.

**Added**

- `src/providers/fixtures.ts` — representative payloads in each service's own
  shape, including the traps above.
- `src/providers/import.test.ts` — normalisation, units, dedup, pagination, token
  refresh and rate-limit handling. Assertions pin physiological plausibility, not
  just types.
- `scripts/verify-providers.mjs` / `npm run verify:providers`.
- `docs/provider-import.md` — what is verified, what is not, and why.

## 0.4.0

The engine stops being only our app's engine: a versioned public contract that
somebody else can build against.

**Added**

- **`/v1` — the public engine API** (`src/api/publicApi.ts`). Deliberately a
  separate surface from `/api/*`: our own app's routes may change whenever the
  app does, but `/v1` is somebody else's dependency, with its own
  `CONTRACT_VERSION`, its own flattened response shapes, and golden tests that
  fail if a field disappears — because on the other side of it is watch firmware
  nobody can hotfix. Six endpoints: `plan`, `course`, `absorption`, `heat`,
  `catalog`, `meta`. Every response, including every error, is stamped with the
  contract, engine and platform versions.
- **Per-tenant API keys** (`src/api/apiKeys.ts`). Only a SHA-256 hash is stored,
  so a leaked database hands over nothing usable; the plaintext is returned once
  and the response says so. Scoped (`plan`, `course`, `catalog`, `cohort`),
  revocable without a deploy, and compared in constant time. `ygf_live_` in
  production, `ygf_test_` everywhere else.
- **Rate limiting and usage metering** (`src/api/rateLimit.ts`). A token bucket
  rather than a fixed window, which a caller can straddle to spend twice the
  limit at the moment it matters. Usage is counted per key, per endpoint, per day
  — aggregate only, because answering "how many calls" never requires holding a
  partner's athletes' body data.
- **Key administration** behind `org:configure`: issue, list with usage, revoke.

**Why it exists.** The vision names this exactly: Phase 6 says the engine, not
the app, is the product, and that a licensing conversation needs versioning, a
stable contract, rate limiting and per-tenant keys. Versioning landed in 0.3.0;
this is the other three. Phase 2 needs the same thing sooner — a Garmin Connect
IQ app is a third-party client calling the engine over HTTP, and `/v1/plan`
already returns the flat, ordered cue list a watch counts down to.

**Fixed**

- **Privilege escalation on both deployments.** The transports honoured the
  `x-role` demo header unconditionally, so an unauthenticated request carrying
  `x-role: admin` became an org admin — `allowRoleSwitching` gated the UI's role
  picker and nothing else. It now gates the header too. Found while wiring the
  owner-only key endpoint, whose gate it would have bypassed.
- **The Vercel adapter never passed request headers to the router**, so every
  `/v1` call would have looked unauthenticated on that deployment while working
  on the other — the exact drift a shared router exists to prevent. It also now
  forwards the raw body, which payment-webhook signature verification needs.
- `/v1` reached the router on neither deployment: the Node server only forwarded
  `/api/`, so the SPA fallback answered an unauthenticated keyed endpoint with
  **200 and a page**. Vercel needed a rewrite, which delivers the path as
  `/api/v1/...`, so the router normalises both forms and a test pins that the two
  return identical answers.
- `planRouteFuelling`'s catalog was not threaded through the course endpoint, so
  a tenant with their own product library would have got our products named in
  their stops.

## 0.3.0

The release that made the platform describable: every module versioned,
documented and reported by the running server.

**Added**

- **Version manifest** (`src/version.ts`): a per-module version, layer,
  stability label and public API for all 25 modules, plus the platform version.
  `package.json` and the runtime config now read the platform version from here
  instead of each carrying their own copy — before this, the repository claimed
  `0.1.0` in one place and `0.2.0` in another.
- **`GET /api/version`** — what is actually deployed, module by module.
- **Documentation**: [`docs/modules.md`](docs/modules.md) (every module: what it
  owns, what may be imported from it, and why anything less than stable is less
  than stable) and [`docs/engine.md`](docs/engine.md) (the engine file by file).
- **Manifest tests** (`src/version.test.ts`): a module cannot be added to `src/`
  without being versioned and documented, a `preview` label must state what is
  missing, and the `domain` layer is checked to be free of React, `fetch` and
  `localStorage` — the property that lets the engine run unchanged in a test, a
  browser, a server and an edge function.

**Engine — 1.1.0 → 1.2.0**

- **Heat strain** (`heatStrain.ts`): apparent temperature via the Rothfusz heat
  index, sweat rate from intensity × body mass with a humidity penalty where
  evaporation starts failing, sodium loss at that rate, and the rise in glycogen
  use in the heat, capped at +25 %. A measured sweat rate or sweat sodium always
  overrides the model and says which was used.
- **Race simulation** (`simulate.ts`): the route walked segment by segment with
  carbohydrate, fluid, sodium and time tracked against the athlete's own store.
  Runs the course twice — with the plan and on water alone — and names the
  kilometre where each crosses the fade line.

**Interface — components 1.1.0 → 1.2.0, i18n 1.0.0 → 1.1.0**

- The **race forecast** card: both curves against the fade line, the four figures
  behind them, and any warnings, in all four languages. Warnings carry their
  numbers as well as their English sentence, so each locale writes its own.

**Fixed**

- Legend colour swatches were scoped to the energy strip, leaving the
  fitness/fatigue legend as two words with no way to tell which curve was which.
- The bonk marker was an SVG circle in a non-uniformly scaled plot, drawn as an
  ellipse — wider on a desktop than on a phone.
- The forecast headline and its first warning stated the same thing twice.
- Reported kilometres carried a decimal, implying a precision the model does not
  have.

## 0.2.0

Phase 1 unblocked: the free Swiss app, earning through affiliate commission
rather than subscriptions.

- Subscriptions and direct sale switched off behind `subscriptionsEnabled` and
  `sellDirect`; every tier serves the full feature set.
- Affiliate hand-off to partner shops, with honest labelling when no programme
  is signed.
- Race import from GPX, and a fuelling plan for a course never run before.
- Absorption ceilings, training load analytics, and anonymous cross-athlete
  cohort learning.
- The past-run debrief, French and Italian dictionaries, and the start screen.

## 0.1.0

The first working platform: engine, connectors, activity pipeline, planner,
insights, catalog, auth, and the Node and Vercel deployments sharing one router.

---

## Why the platform is not 1.0.0

Three things are interfaces with a documented stand-in behind them, and the
platform reaches 1.0.0 when they are real:

- **Connectors** (`src/providers`, 0.6.0) — authorisation URLs and scopes are the
  real ones; token exchange and live API calls are the next step.
- **Payments** (`src/commerce`, 0.8.0) — implemented and unit-tested, not yet
  verified against a live Stripe test-mode account.
- **On-device health** (`src/health`, 0.9.0; `mobile`, 0.7.0) — normalisation is
  real and tested, but native HealthKit and Health Connect reads need a physical
  device.

Modules that *are* settled carry 1.x versions today. That is the point of
versioning them separately: the engine's contract does not become provisional
because a connector's is.
