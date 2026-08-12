# Hosting this in Switzerland

A Swiss sports-nutrition product that stores training data on a US hyperscaler
is a slightly awkward thing to explain to the athletes it serves. This document
is how to run the whole platform on Swiss infrastructure — Infomaniak, or any of
the alternatives below — and, just as importantly, what still leaves the country
and why.

Nothing here needs a code change. The app has always resolved its configuration
at runtime, so "run it on a Swiss host" is a matter of choosing a shape,
filling in `deploy/env.example`, and running two checks.

> **What was verified, and what was not.** The preflight rules, the SMTP client,
> the security and cache headers and the graceful shutdown are unit-tested and
> were exercised against a real production-mode server (`npm run verify:deploy`,
> all checks passing). The container image, the Compose stack and the Kubernetes
> manifests were **not** built or applied here — this sandbox has no Docker
> daemon and no outbound access to a cloud provider. CI builds and boots the
> image on every push, which is where that gap closes. Treat the Infomaniak
> product names as a starting point and confirm them in the console: their
> catalogue moves faster than any document about it.

## Pick a shape

| | One instance | Managed Kubernetes | PaaS / managed Node |
| --- | --- | --- | --- |
| Infomaniak product | Public Cloud instance, or a VPS | Managed Kubernetes | their managed application hosting |
| What you run | `deploy/compose/docker-compose.prod.yml` | `deploy/kubernetes/` | the image, or `npm ci && npm run build && npm start` |
| TLS | Caddy, automatic | ingress + cert-manager | the platform's |
| Database | container, or managed | managed | managed |
| Good for | launch, and longer than you would think | more than one instance, rolling deploys | least to operate |

All three run the same image and the same configuration. Start with the first
one. A single instance with a managed database behind Caddy will carry this app
a long way, and it is one `docker compose up` to move to.

### One instance, end to end

```bash
# On a fresh Swiss instance with Docker installed, and DNS already pointing at it.
git clone <this repo> && cd you-go-further/deploy/compose
cp ../env.example prod.env && $EDITOR prod.env

# Check the configuration before anything is running.
cd ../.. && npm run preflight -- deploy/compose/prod.env

cd deploy/compose
export DOMAIN=yougofurther.ch ACME_EMAIL=ops@yougofurther.ch
export POSTGRES_PASSWORD="$(openssl rand -hex 24)"
docker compose -f docker-compose.prod.yml up -d --build

# Check the deployment now that it is running, from outside.
cd ../.. && npm run verify:deploy -- https://yougofurther.ch
```

The two checks answer different questions and you want both. `preflight` reads
the configuration and refuses the defaults that are wrong in production — the
development signing key, the in-memory store, the demo role switcher.
`verify:deploy` reads the running deployment over HTTP: whether HSTS survives
the proxy, whether `config.js` is being cached by something in front, whether
`x-role: admin` is still honoured because the container is running an older
image than the config file you just edited.

### Managed Kubernetes

`deploy/kubernetes/` — four manifests, `kubectl apply -k`, see the README there.
Two replicas, a disruption budget, probes that distinguish "stuck" from "cannot
reach the database", and a `preStop` delay so a rolling deploy does not serve a
scatter of 502s.

### Managed application hosting

If the provider runs Node directly rather than a container:

```
build:  npm ci && npm run build && node scripts/host-config.mjs
start:  npm start
health: /api/health
```

`npm start` is a single process (`node --import tsx server/index.ts`), so the
platform's SIGTERM reaches the graceful shutdown instead of a shell.

## The database

Use the provider's managed PostgreSQL rather than a container you look after.
Backups, point-in-time recovery and failover are the entire reason to pay for
one, and each is a project on its own.

- `DATABASE_URL=postgres://user:pass@host:5432/db?sslmode=require` — the TLS
  mode is not decoration; without it the credentials and every row cross the
  provider's network in the clear. The preflight warns when it is missing.
- Migrations run at start-up (`runtime.init()`), so a deploy needs no separate
  step and a fresh database is populated by the first boot.
- If you do run the container: `deploy/backup/pg-backup.sh` dumps nightly to
  S3-compatible storage, encrypted before it leaves the host, and
  `pg-restore-check.sh` restores the newest one into a scratch database and
  asserts it is not empty. Run the second one monthly. A backup nobody has
  restored is a belief, not a backup.

## Mail

Magic-link sign-in needs to send email, and the transactional providers this app
supported until now — Resend, Brevo, Postmark, Mailgun — are all foreign
companies processing your athletes' addresses. A Swiss deployment usually
already has a Swiss mailbox, so the app now speaks SMTP directly:

```
MAIL_SMTP_URL=smtps://no-reply%40yougofurther.ch:PASSWORD@mail.infomaniak.com:465
MAIL_FROM=no-reply@yougofurther.ch
```

Port 465 is TLS from the first byte. Port 587 works too and upgrades with
STARTTLS, which is the default for `smtp://` URLs — the preflight refuses a
plaintext submission URL with STARTTLS switched off, because that puts the
mailbox password on the wire. Percent-encode the user and password: an `@` or a
`:` in a password otherwise breaks the URL in a way that produces a confusing
authentication failure rather than a parse error.

Set SPF, DKIM and DMARC on the sending domain in the mail provider's console.
Without them a sign-in link is a message from an unfamiliar host with a URL in
it, which is the exact shape of a phishing mail, and it will be filed as one.

## What still leaves Switzerland

Hosting is not the whole story, and a claim of "Swiss hosting" that quietly
means "except for all the interesting parts" is worse than no claim. Everything
below is a deliberate egress, and each one is optional except the first two.

| Destination | What goes there | Optional? |
| --- | --- | --- |
| **Strava, Garmin, Polar, Suunto** (US/FI) | OAuth, and the athlete's activities coming back | Only by not offering the connector — set `ENABLED_PROVIDERS` |
| **Map tiles** (CARTO/OSM by default) | The viewport of a route being looked at | Yes — self-host tiles and set `TILE_URL` |
| **swisstopo, MeteoSwiss** | Coordinates of a route, for terrain and weather | Swiss federal services; the data stays in CH |
| **Stripe** (US/IE) | Payment details, if you sell subscriptions | Yes — `SUBSCRIPTIONS_ENABLED=false`, the Phase-1 default |
| **Databricks** | Every ingested activity, if the export is on | Yes — `EXPORT_ENABLED=false`, the default |
| **Google / Apple sign-in** | The identity assertion, if those buttons are shown | Yes — leave `GOOGLE_CLIENT_ID` / `APPLE_CLIENT_ID` unset |
| **Your mail provider** | Recipient address and the sign-in link | Choose a Swiss one — see above |

The first row is not removable while the product's premise is "your training
data, analysed": Strava is where the athlete's training already is. It is worth
saying plainly in the privacy notice rather than leaving it to be discovered.

Under the revised Swiss Data Protection Act (revFADP/nLPD, in force since
September 2023) and the GDPR where it applies, each of these is a processor
relationship needing a contract and an entry in the record of processing
activities. Health-adjacent data — heart rate, sweat rate, readiness — is
sensitive personal data under both, which is the reason to keep the primary
store in Switzerland even though hosting location alone is not compliance.

## Alternatives to Infomaniak

The same manifests run unchanged on any of these; all are Swiss-operated with
Swiss data centres.

- **Exoscale** — instances, SKS (managed Kubernetes), managed PostgreSQL,
  S3-compatible object storage.
- **cloudscale.ch** — instances and object storage; run the Compose stack.
- **Swisscom** — application cloud and managed database services.
- **Nine, Metanet, Hostpoint** — managed Kubernetes and managed hosting.

What the app needs from a provider is small on purpose: a container runtime or
Node 22, a PostgreSQL, outbound HTTPS, and somewhere to put a backup.

## Before you go live

- [ ] `npm run preflight -- deploy/compose/prod.env` — no blockers.
- [ ] `npm run verify:deploy -- https://your-domain` — every check passes over
      the real, public URL, including HSTS and the HTTP→HTTPS redirect.
- [ ] `AUTH_SECRET` is unique to this environment and stored in a secret
      manager, not in the repository and not in a shell history.
- [ ] `ALLOW_ROLE_SWITCHING=false`. `verify:deploy` proves it from outside.
- [ ] A restore has actually been performed: `deploy/backup/pg-restore-check.sh`.
- [ ] SPF, DKIM and DMARC pass for the sending domain — send yourself a sign-in
      link and read the headers.
- [ ] Provider OAuth callback URLs point at the production domain, in each
      provider's console.
- [ ] If you sell anything: `npm run verify:payments` against Stripe test mode,
      then one real test-mode purchase with the webhook delivered to the public
      URL (`stripe listen --forward-to https://your-domain/api/webhooks/payments`).
- [ ] The Connect tab shows "MeteoSwiss station" rather than "estimated" — this
      repository's sandbox blocks `*.geo.admin.ch`, so that path has never been
      exercised against the live service and the first real network is where it
      gets proven.
- [ ] `OPERATOR_NAME`, `OPERATOR_ADDRESS` and `PRIVACY_CONTACT` name the real
      controller, and `TERMS_URL` points at terms that exist. The app renders
      them on Privacy & your data; preflight blocks the deployment without
      them. Nobody may invent these on the operator's behalf.
- [ ] The privacy screen's third-party list still matches the table above —
      re-read it after changing `ENABLED_PROVIDERS`, `TILE_URL` or the mailer.
- [ ] Someone has actually used the two buttons on that screen against
      production: the export downloads a file with their data in it, and
      deleting the account really removes it.
