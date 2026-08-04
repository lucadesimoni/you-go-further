# The public engine API — `/v1`

The decision engine, callable by someone who is not us: a wearable maker, a
training platform, or our own Garmin Connect IQ app.

This is a **contract**, not an export of internal shapes. `/api/*` serves the You
Go Further app and changes whenever the app does. `/v1/*` is somebody else's
dependency — it carries its own version, its own flattened responses, and golden
tests that fail if a field disappears. On the other side of it may be watch
firmware nobody can hotfix.

## What it does not do

No athlete identity, no storage, no history. **A request carries everything the
answer needs.** That is what makes the engine embeddable in someone else's
product without dragging our database along — and it means integrating does not
hand us your users.

## Authentication

Every call needs a key, in either header:

```http
X-API-Key: ygf_live_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
Authorization: Bearer ygf_live_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

Keys are issued per tenant by a platform owner. **Only a hash is stored**, so the
plaintext is shown once at issue and never again — if it is lost, issue another
and revoke the old one. `ygf_live_` in production, `ygf_test_` elsewhere, so a
leaked test key is not an incident.

| Status | Meaning |
| --- | --- |
| `401 unauthorized` | no key, an unknown key, or a revoked one |
| `403 insufficient_scope` | a valid key without the scope this endpoint needs |
| `429 rate_limited` | over the key's limit; `retryAfterSec` says when to return |
| `400 invalid_request` | `detail` names the field that was wrong |

401 and 403 are deliberately different: "who are you" and "not with that key" are
different problems, and an integrator debugging at 2am should not have to guess
which one they have.

### Scopes

| Scope | Grants |
| --- | --- |
| `plan` | `/v1/plan`, `/v1/absorption`, `/v1/heat` |
| `course` | `/v1/course` |
| `catalog` | `/v1/catalog` |
| `cohort` | reserved for pooled outcome data |

`/v1/meta` needs only a valid key — a partner must be able to discover what their
own key can do.

### Rate limits

A **token bucket**, refilling continuously at the key's limit per minute. A fixed
window would let a caller spend a full minute's allowance in the last second of
one window and again in the first second of the next — twice the limit exactly
when it hurts. A burst up to the bucket size is fine; the sustained rate is the
limit.

## Versioning

Every response, including every error, carries three versions:

```json
{ "contract": "1.0.0", "engine": "1.2.0", "platform": "0.4.0" }
```

- **`contract`** — this API's shape. It moves for *additive* changes only. A
  breaking change means `/v2`, never a bump here.
- **`engine`** — the physiology behind the numbers. It moving means the advice
  improved; your integration does not change.
- **`platform`** — the release. Useful in a bug report.

That split is the point: a partner can tell an engine improvement from a contract
change without reading a changelog.

## Endpoints

### `GET /v1/meta`

What this key can do, the rate limit it carries, and every endpoint with the
scope it needs. Start here.

### `POST /v1/plan`

The core call. A session in, a complete fuelling plan out.

```json
{
  "goal": "race-preparation",
  "activity": "trail-running",
  "intensity": "race",
  "durationMin": 300,
  "bodyWeightKg": 70,
  "conditions": "hot",
  "sweatLevel": "heavy",
  "physiology": { "sweatRateMlPerH": 1400, "sweatSodiumMgPerL": 1100 }
}
```

Returns `target` (carbohydrate g/h and total, fluid ml/h, sodium mg/L),
`cues`, `phases` and `deliverability`.

**`cues` is the watch payload**: a flat, time-ordered list of *at this minute, do
this*, each with `carbG`, `fluidMl`, `sodiumMg` and a `caffeine` flag. Count down
against it; nothing else is needed during the session.

`physiology` is optional, and it is what moves a plan off population buckets onto
this athlete. `target.hydrationSource` and `sodiumSource` report `measured` or
`estimated` — **surface that.** Hiding provenance lets our estimate be shown as
your fact.

`deliverability` answers whether the gut can absorb the rate at all, from the
products actually chosen. A plan asking 90 g/h from glucose-only gels is not an
aggressive plan, it is an impossible one.

### `POST /v1/course`

The same session against a real height profile.

```json
{
  "session": { "...": "as above" },
  "route": [{ "distanceM": 0, "altM": 570 }, { "distanceM": 10000, "altM": 900 }],
  "weather": { "temperatureC": 24, "humidityPct": 65 }
}
```

Returns `route` (distance, ascent, climbs), `stops` (where to feed, in km and
minutes, with a product named), `forecast` and `points`.

`forecast` runs the course **twice** — with the plan and on water alone — and
names the kilometre where each crosses the fade line. That contrast is the
product: not "drink now", but "you fade at km 31 on water, and finish with 21 %
in the tank if you take these four feeds". `warnings` carry both an id with its
numbers (`values`) and our English (`text`), so you can write your own copy in
your own language.

Up to 5000 route points. Distance must not run backwards.

### `POST /v1/absorption`

Can this mix deliver this rate? The most useful call for a partner with their own
products.

```json
{ "targetPerHourG": 90, "items": [{ "productId": "sponser-multi-carbo", "servings": 2 }] }
```

or raw sugars: `{ "targetPerHourG": 90, "glucoseG": 60, "fructoseG": 30 }`.

Glucose saturates its transporter at ~60 g/h; adding fructose recruits a second
route and lifts the ceiling to ~90 g/h. An undeclared product counts as glucose —
the assumption that fails safe.

### `POST /v1/heat`

What today's conditions cost in sweat, sodium and glycogen. The one call worth
repeating *during* a race, because the weather is the input that actually changes
while the athlete is out there.

```json
{ "bodyWeightKg": 70, "intensity": "race", "temperatureC": 31, "humidityPct": 80 }
```

Returns the apparent temperature, a risk band, sweat and sodium rates, the
carbohydrate burn multiplier, and one line of advice naming the numbers.
`measured` is `true` only when you supplied a real sweat measurement.

### `GET /v1/catalog`

The product library the plans are built from. A tenant with their own products
gets their own catalog here, and their products named in `/v1/plan` and
`/v1/course`.

## Administration

For a platform owner, behind `org:configure`:

| Call | Does |
| --- | --- |
| `POST /api/keys` | issue a key — `{ tenantId, name, scopes?, rateLimitPerMin? }`. Returns the plaintext **once**. |
| `GET /api/keys` | list keys (never a hash, never a secret) with usage per key, per endpoint, per day |
| `DELETE /api/keys/:id` | revoke. The record stays, so its usage history stays attributable. |

Usage is **aggregate only** — counts, never the requests. Answering "how many
calls" has never required holding a partner's athletes' body data.

## An honest limit

The numbers are a transparent model built on published population physiology, not
a measurement of the athlete in front of you. The engine says so on every surface
we own, and a partner integrating it should say so too.
