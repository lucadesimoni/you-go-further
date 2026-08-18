# Elestio, on a European VM

Elestio is a managed layer over someone else's hardware: you pick the cloud
provider and the region, it provisions the VM, runs your Compose stack from git,
terminates TLS, and keeps the machine patched. For this app that lands between
the two shapes already in `docs/deployment.md` — more managed than
[`deploy/compose`](../compose) on a bare VM, less than Render — and it is the
one that lets you keep the hardware in Europe while someone else runs it.

## What is verified here, and what is not

Being straight about this, because the gap matters when you are about to point a
domain at it:

**Verified in this repository.** The Compose file resolves (`docker compose
config`), binds the app to the Docker bridge rather than the public interface,
and fails loudly with a named message when `POSTGRES_PASSWORD` is absent rather
than starting an unauthenticated database. `env.example`, filled in, passes
`npm run preflight` in production mode with **0 blockers and 0 warnings**. The
image itself, its preflight-before-server entrypoint, the security headers and
the graceful shutdown are unit-tested and exercised by CI on every push.

**Not verified.** The image was not built and this stack was never started — the
sandbox this was written in has no Docker daemon. And `elest.io` is blocked by
its egress policy, so **Elestio's own documentation could not be read**: the two
values below that belong to their platform rather than to this app — the
`172.17.0.1:<port>` bridge convention, and the fact that dashboard variables
land in `.env` beside the compose file — are from general knowledge of how their
service templates are built, not from their docs. Confirm both in the dashboard
before you rely on them. Everything else here is this repository's own contract
and is checked.

## Picking the provider and the region

Elestio provisions onto a provider you choose. What actually differs for this
app is **where the athletes' data physically sits**, because it holds weight,
heart rate, sweat rate and every route someone has run.

| Provider | Closest region | Notes |
| --- | --- | --- |
| Hetzner | Falkenstein / Nuremberg (DE) | Cheapest per GB of RAM by some distance; EU/EEA |
| Hetzner | Helsinki (FI) | Same, further from Swiss users by ~20 ms |
| Scaleway | Paris (FR) | EU/EEA |
| DigitalOcean | Frankfurt (DE) | EU/EEA, US-parent company |

**Hetzner Falkenstein** is the recommendation: it is the cheapest of the four,
it is ~10 ms from Zürich, and Germany is inside the EEA.

One thing to decide deliberately rather than discover later:
[`docs/hosting-switzerland.md`](../../docs/hosting-switzerland.md) argues this
product should run on Swiss infrastructure, and none of these options are Swiss.
A German VM is legally unproblematic — Germany is inside the EEA for the GDPR
and on Switzerland's adequacy list under the revised FADP, so no transfer
mechanism is needed — but "hosted in Switzerland" is a claim this deployment
cannot make, and it is a claim a Swiss endurance-sports product may well want.
If it matters, the Swiss shapes in that document run the same image on
Infomaniak or Exoscale; if it does not, Hetzner is the better machine for the
money. It is a positioning call, not a technical one.

**Size.** Two containers, one of them Postgres. 2 vCPU / 4 GB carries the launch
comfortably; 2 GB works and leaves little headroom for a `pg_dump` running
beside the app. Disk is the thing to watch, not CPU — training data and route
polylines accumulate.

## Deploying

**1. Create the service.** In Elestio: *New service → CI/CD from git*, pick
Hetzner and the Falkenstein region, and connect this repository.

**2. Point it at the right Compose file.**

```
Compose file path   deploy/elestio/docker-compose.yml
Branch              main
```

> ⚠ **Do not leave this at the repository root.** The root `docker-compose.yml`
> is the *development* stack: `APP_ENV=development`, the file store, and
> `ALLOW_ROLE_SWITCHING=true` — which serves any unauthenticated request
> carrying `x-role: owner` as an owner. It is the default path most platforms
> assume, and it is the one thing here that would go wrong silently.

**3. Fill in the environment.** Copy [`env.example`](./env.example) into the
service's Environment tab. Generate the two secrets:

```bash
openssl rand -hex 32     # AUTH_SECRET
openssl rand -hex 24     # POSTGRES_PASSWORD — must match DATABASE_URL
```

Check it before it runs, from a clone:

```bash
cp deploy/elestio/env.example deploy/elestio/.env
$EDITOR deploy/elestio/.env
npm run preflight -- deploy/elestio/.env
```

`.env` is gitignored. Preflight is not advisory — the container runs it on
itself at start-up and refuses to boot on a blocker, so a missing `AUTH_SECRET`
fails in the deploy log rather than quietly signing sessions with the public
development key.

**4. Deploy, then check the behaviour rather than the status badge.**

```bash
npm run verify:deploy -- https://<your-service>.vm.elestio.app
```

Preflight reads configuration; this reads what the running deployment actually
does — that the proxy did not strip a security header, that `config.js` is not
being cached, that the demo role header really is refused. Run it after the
first deploy and again after any DNS or proxy change.

**5. Attach the custom domain** in Elestio, then set `ALLOWED_ORIGINS` to it and
redeploy.

## After it is up

**Postgres.** The `db` container is the simplest thing that works and it is
backed by a named volume on that one VM. Elestio's managed Postgres is the
better answer as soon as this data matters to anyone but you: point
`DATABASE_URL` at it with `?sslmode=require`, drop the `db` service, and
point-in-time recovery stops being something you have to remember.

**Backups.** Elestio snapshots the VM, which is not the same thing as a restored
database. [`deploy/backup/pg-backup.sh`](../backup) dumps to S3-compatible
storage and encrypts each dump with `age` before it leaves the host; there is a
restore *check* beside it, because a backup nobody has restored is a hypothesis.

**Updates.** Elestio redeploys on push to the tracked branch. The image is
configured at start rather than at build, so promoting a tag between
environments does not rebuild it — which is what stops staging from quietly
pointing at production.
