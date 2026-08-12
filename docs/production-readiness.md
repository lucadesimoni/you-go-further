# How ready is this to go live?

An honest answer, written against what has actually been run rather than what
is intended. Dated 12 August 2026, platform 0.15.0.

Short version: **the software is ready; the deployment and the content are
not.** Nothing in the code is known to be broken. What stands between this and
five-star reviews is a set of things only a real deployment, a real device and
a real editor can supply — and one of them (terms of service) is a legal
blocker rather than a nice-to-have.

## What is proven

| Suite | What it covers | Where it runs |
| --- | --- | --- |
| 858 unit tests, 57 files | the engine, the stores, auth, i18n, the router, the style tokens, the version manifest | CI, every push |
| e2e journey (~50 steps) | sign-in → onboarding → plan → route → debrief → checkout, four languages, a phone in German, the athlete's own data | CI, against a real Node server |
| demo suite | the client-side build a static host serves, with no API at all | CI |
| mobile suite | the Expo screens through react-native-web, against the same API a phone talks to | locally; not yet in CI |
| container check | the production image starts, serves, and answers `verify:deploy` from outside | CI, every push |

Beyond the tests:

- **`npm run preflight`** refuses a production configuration with the
  development signing key, an in-memory store, the demo role switcher, a
  plaintext SMTP password, a Stripe key with no webhook secret, or nobody named
  as responsible for the data. The server runs it at start-up and exits rather
  than coming up misconfigured but healthy-looking.
- **`npm run verify:deploy`** checks the running deployment from outside:
  security headers, HSTS, the HTTP→HTTPS redirect, cache rules, and that
  `x-role: admin` is refused.
- **Data rights work end to end**, in both builds. With a server the export is
  the server's own answer; without one it is assembled from the browser's
  stores. Deletion erases activities, logs, connections, profile and account,
  keeps paid orders as accounting records and says so, and a session presented
  for a deleted account is refused.
- **The bundle is not the problem**: 196 kB gzipped for the app, 15 kB of CSS,
  with the map split into a further 45 kB that loads only when a map does.

The journey moving into CI earned its keep on the first run: it exposed a race
in which an athlete's saved weight reverted to the old value with no error
anywhere — a read already in flight when they typed came back stale and landed
on top of them. It never reproduced on this machine; a faster one loses the
race more often, which is the whole argument for running the suite somewhere
other than where it was written. It is now a deterministic step of its own. Making the pipeline honest turned up two more things nothing here could
have seen: a session token that kept working after its account was deleted,
and a production image that could not start at all with the file store,
because it runs as `node` and `/app/.data` was root-owned. That last one is
the path `docker compose up` takes.

## What is not ready

### Blocking — a real deployment cannot skip these

1. **Terms of service do not exist.** The sign-in screen tells people they
   agree to them. `TERMS_URL` is configuration and preflight warns when it is
   unset, but no document has been written. This is a lawyer's job, not a
   developer's.
2. **The operator's legal identity is unset by definition.** `OPERATOR_NAME`,
   `OPERATOR_ADDRESS` and `PRIVACY_CONTACT` block a production deployment until
   filled in. That is deliberate — the app must not invent an Impressum — but
   somebody has to fill them in.
3. **Nothing has ever been deployed publicly.** Every check above ran on
   localhost. The first real deployment is where TLS, HSTS, the proxy, the
   backup and the mail domain get proven. `docs/hosting-switzerland.md` has the
   checklist; none of it has been ticked against a real host.
4. **No error reporting.** A crash shows the athlete a way back and writes to
   the browser console — where nobody will ever read it. Until a reporter is
   wired in (Sentry or equivalent, self-hostable if the Swiss story matters),
   you will learn about bugs only from reviews.

### Unproven — likely fine, but nobody has watched it work

- **Stripe.** Subscriptions are off for the Phase-1 launch (free, affiliate
  commission), so this blocks nothing today. The webhook has never been
  delivered to a public URL; `npm run verify:payments` exists for the day it
  matters.
- **swisstopo and MeteoSwiss.** This repository's sandbox blocks
  `*.geo.admin.ch`, so the live responses have never been seen. The app is
  built to fall back and to say when it has, and that fallback *is* tested —
  but "MeteoSwiss station" instead of "estimated" is a first-network claim.
- **Apple Health and Health Connect.** The mobile suite drives the real sync,
  validation, readiness and profile paths, but the device read itself is a
  stand-in — HealthKit cannot run in a browser. Nobody has installed this on a
  phone.
- **Postgres at size.** The schema and migrations run; a restore has never been
  performed from a real backup. `deploy/backup/pg-restore-check.sh` exists for
  exactly that and should be run once before launch, not after the first
  incident.

### Content — this is what five-star reviews are actually made of

The engine is the differentiator and it is finished. The *data around it* is
thin, and an athlete cannot tell the difference between "the model is weak" and
"the model was given nothing to work with".

- **12 Swiss events, and not one has aid-station data.** The app handles this
  honestly — over 20 km it says "we do not have this race's aid stations, plan
  to carry everything" — but an athlete planning Jungfrau wants to know there
  is Coke at km 30. Every organiser publishes this in a race manual. It is
  transcription work, and it is the single highest-value content investment.
- **Race dates are approximate.** `refresh:events` fetches confirmed dates from
  organisers' own markup; it has never run, because this environment blocks the
  hosts. Run it somewhere with network before launch.
- **17 guide articles, English only**, in an app whose interface speaks four
  languages. The UI says so rather than pretending, but a Romand athlete
  reading English guidance in a French app notices.
- **24 products.** Enough to plan with, not enough to be the place people shop.

## What I would do next, in order

1. Write the terms and fill in the operator configuration. Everything else is
   optional; this is not.
2. Deploy to a Swiss host and walk `docs/hosting-switzerland.md` end to end —
   including the restore and a real sign-in email with passing SPF/DKIM/DMARC.
3. Wire an error reporter before the first real athlete, not after.
4. Transcribe aid stations for the 12 events, and run `refresh:events` for
   confirmed dates.
5. Install it on an actual phone and connect a real Strava account. That is the
   first time the product will have been used the way it is meant to be used.
6. Translate the guide.
