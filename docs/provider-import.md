# Provider import — what is verified, and what is not

Four services, four payload shapes, one `Activity`. This is what the import
actually does, what has been tested, and — the part that matters most — what
has **not** been tested and why.

## What could not be verified here

**No live API call has been made against Strava, Garmin, Polar or Suunto.** Three
things are missing, and none of them is a code problem:

1. **Network.** This build environment blocks every provider host. `curl` to
   `www.strava.com`, `connectapi.garmin.com`, `www.polaraccesslink.com` and
   `cloudapi.suunto.com` all return a policy denial from the egress proxy.
2. **A registered developer application** per provider, with a client id and
   secret. Garmin's and Suunto's require an approved application; Polar's needs
   an AccessLink account.
3. **A real athlete's account with real training in it**, plus an interactive
   OAuth consent, which by design cannot be scripted.

So the field names, units and enum values below are written from each provider's
published documentation **as of this repository's knowledge, and are unverified
against the live services**. That is a real limitation, and it is why
`scripts/verify-providers.mjs` exists.

## Verifying against the live APIs

```bash
STRAVA_ACCESS_TOKEN=... \
GARMIN_ACCESS_TOKEN=... \
POLAR_ACCESS_TOKEN=... \
SUUNTO_ACCESS_TOKEN=... SUUNTO_SUBSCRIPTION_KEY=... \
npm run verify:providers
```

Any subset works. For each provider with a token it calls the real endpoint,
prints the first raw payload (redacted), checks that every field our normaliser
reads is present, and asserts the normalised session is physiologically sane. A
provider with no token is reported **skipped, not passed** — a check that quietly
succeeds when it could not run is worse than no check.

It is deliberately outside `npm test`. Run it after any provider announces an API
change, and before a release that touches import.

## What *is* verified, in CI

`src/providers/fixtures.ts` holds representative payloads **in each provider's own
shape**, and `src/providers/import.test.ts` runs them through the real
normalisers. The assertions pin physiological plausibility, not just types: an
average heart rate of 2.6 is a valid number and a broken import.

The fixtures deliberately include what breaks naive importers — and every one of
these was an actual defect found by writing them:

| Trap | What went wrong | Fixed |
| --- | --- | --- |
| Garmin sends `activityType` as a **string**; the internal web API sends `{ typeKey }` | We read only the object form, so **every** Health API session came back as sport "other" | Both shapes read |
| Garmin sends `startTimeInSeconds`, not `startTimeGMT` | The fallback fired, stamping **all imported history with today's date** — the input training-load analysis is built on | Both shapes read; the epoch is already UTC, so the local offset is *not* added |
| Garmin calls ascent `totalElevationGainInMeters` | Elevation was silently dropped | Both names read |
| Polar's `start-time` is local wall clock, with the zone in `start-time-utc-offset` | Parsed as the *server's* local time — a Swiss athlete's summer sessions landed two hours off, some on the wrong day | The offset is applied |
| Polar sends `training-load` | Discarded, then recomputed worse from averages | Kept |
| Suunto reports heart rate in **hertz** | 2.6 bpm — a number that does not throw and ruins every intensity, load and fuelling target downstream | Converted; a value under 15 is hertz, since nothing plausible sits between 4 and 25 |
| Suunto sends a **numeric** `activityId`, not a name | Every workout was sport "other" | The enum is mapped, unknown ids stay "other" |
| Strava paginates at 100 | A single page: any backfill with more sessions was silently truncated, which looks exactly like "they did not train much" | Paged until a short page, capped at 2000 |
| Strava access tokens last **six hours** | No refresh anywhere. The first sync of the day worked and every one after it 401'd, with the athlete's history simply stopping | Refreshed when expired or within a minute of it, and the rotated refresh token is kept |
| Strava returns 429 when rate-limited | Threw, losing the whole sync | Returns what it has: a partial sync beats none |

## Sample data

`generateSampleActivities` is what the demo, the screenshots and every e2e run
are judged on, so an impossible session in it is a product defect.

Speed used to be drawn independently of duration, which produced a 3.5-hour run
at 4:24/km over 48 km, and a 100 km Swiss ride with 254 m of climbing. Now:

- **Pace decays with duration** — a power law, roughly 6 % slower per doubling of
  time. The shape of the real curve, without pretending to be Riegel's exact
  exponent.
- **Ascent is Swiss** and scales with distance: 25–55 m/km on trails, 8–20 on the
  road.
- **A swim is a swim** — capped well short of the running range, which is what
  used to generate a 12 km pool session.
- **Some sessions have no GPS at all.** A trainer ride and a treadmill run carry
  no track, and data in which every session has one never lets the app meet a
  session without a route.
- **No invented capabilities.** Strava reports no training load and Suunto no
  power, so the sample data reports neither.

All of it is pinned by tests in `sampleData.test.ts`.

## The normalised shape

Everything lands in `Activity` (`src/model.ts`): id namespaced per provider,
`startTime` ISO-8601, `durationSec`, and metres, bpm, watts and kcal throughout.
Ids are `${provider}:${externalId}`, so two services cannot collide, and repeated
imports of the same window — the normal case, since a poll sees the same sessions
over and over — de-duplicate on it.
