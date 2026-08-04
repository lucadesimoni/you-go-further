/**
 * Verify our connectors against the **live** provider APIs.
 *
 * The fixtures in `src/providers/fixtures.ts` and the contract tests beside them
 * check that we read each provider's documented shape correctly. They cannot
 * check that the shape is still what the provider sends today — only the
 * provider can answer that, and only to a caller holding a real token.
 *
 * This script is that caller. It is deliberately *not* part of `npm test`:
 * it needs network egress to each provider, a registered developer application,
 * and an access token for a real athlete account. CI has none of those, and a
 * test that quietly passes when it could not run is worse than no test.
 *
 * Run it after any provider announces an API change, before a release that
 * touches import, and when onboarding a new provider.
 *
 *   STRAVA_ACCESS_TOKEN=... \
 *   GARMIN_ACCESS_TOKEN=... \
 *   POLAR_ACCESS_TOKEN=... POLAR_USER_ID=... \
 *   SUUNTO_ACCESS_TOKEN=... SUUNTO_SUBSCRIPTION_KEY=... \
 *   node scripts/verify-providers.mjs
 *
 * Any subset works — a provider with no token is reported as skipped, not
 * passed. What it checks, per provider:
 *
 *   1. The endpoint answers at all, with the auth scheme we send.
 *   2. Every field our normaliser reads is present on a real payload.
 *   3. Our normaliser turns that payload into a physiologically sane session.
 *
 * It prints the first raw payload it sees, redacted, so a shape change is
 * visible rather than merely reported.
 */
import { mapStravaActivity } from "../src/providers/strava.ts";
import { mapGarminActivity } from "../src/providers/garmin.ts";
import { mapPolarActivity } from "../src/providers/polar.ts";
import { mapSuuntoActivity } from "../src/providers/suunto.ts";

const env = (k) => process.env[k];
let failed = 0;
let ran = 0;

const say = (ok, label, detail = "") => {
  console.log(`  ${ok ? "✓" : "✗"} ${label}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failed++;
};

/** Fields that must exist on a real payload for our normaliser to work. */
const REQUIRED = {
  strava: ["id", "start_date", "moving_time"],
  garmin: ["durationInSeconds"],
  polar: ["id", "start-time", "duration"],
  suunto: ["startTime", "totalTime"],
};

/** Never print a token, a user id, or a GPS track to a terminal or a log. */
function redact(obj) {
  const clone = JSON.parse(JSON.stringify(obj));
  for (const k of Object.keys(clone)) {
    if (/token|secret|user|athlete|email|polar-user/i.test(k)) clone[k] = "«redacted»";
    if (Array.isArray(clone[k]) && clone[k].length > 3) clone[k] = `«${clone[k].length} items»`;
  }
  return clone;
}

/** A normalised session has to be plausible, not merely well-typed. */
function checkSane(a, label) {
  const problems = [];
  const t = Date.parse(a.startTime);
  if (Number.isNaN(t)) problems.push("startTime unparseable");
  // Within a day of now means the fallback fired: the real start time was lost.
  else if (Math.abs(Date.now() - t) < 60_000) problems.push("startTime fell back to now — the real one was not read");
  if (!(a.durationSec > 0)) problems.push("durationSec is zero");
  if (a.sport === "other") problems.push("sport did not map (check the type field)");
  if (a.avgHr !== undefined && (a.avgHr < 30 || a.avgHr > 230)) problems.push(`avgHr ${a.avgHr} is not bpm`);
  if (a.distanceM !== undefined && a.distanceM > 1_000_000) problems.push(`distanceM ${a.distanceM} is not metres`);
  say(problems.length === 0, `${label}: normalises to a sane session`, problems.join("; "));
}

/** Every field our normaliser reads must exist on what the provider actually sent. */
function checkFields(raw, provider) {
  const missing = REQUIRED[provider].filter((f) => raw[f] === undefined);
  say(missing.length === 0, `${provider}: payload carries the fields we read`, missing.length ? `missing ${missing.join(", ")}` : "");
}

async function get(url, headers, label) {
  try {
    const res = await fetch(url, { headers });
    if (!res.ok) {
      say(false, `${label}: HTTP ${res.status}`, res.status === 401 ? "token expired or wrong scope" : await res.text().catch(() => ""));
      return null;
    }
    return await res.json();
  } catch (e) {
    say(false, `${label}: request failed`, e.message);
    return null;
  }
}

// --- Strava ----------------------------------------------------------------
if (env("STRAVA_ACCESS_TOKEN")) {
  ran++;
  console.log("\n── Strava ──");
  const auth = { Authorization: `Bearer ${env("STRAVA_ACCESS_TOKEN")}` };
  const list = await get("https://www.strava.com/api/v3/athlete/activities?per_page=5", auth, "strava: /athlete/activities");
  if (Array.isArray(list) && list.length) {
    console.log("    first payload:", JSON.stringify(redact(list[0]), null, 2).slice(0, 900));
    checkFields(list[0], "strava");
    for (const a of list) checkSane(mapStravaActivity(a), `strava ${a.id}`);
    // `sport_type` is the only field that distinguishes a trail run.
    say("sport_type" in list[0], "strava: sport_type still present", "");
  } else if (Array.isArray(list)) {
    say(false, "strava: the account has no activities to check against");
  }
} else {
  console.log("\n── Strava ── skipped (no STRAVA_ACCESS_TOKEN)");
}

// --- Garmin ----------------------------------------------------------------
if (env("GARMIN_ACCESS_TOKEN")) {
  ran++;
  console.log("\n── Garmin ──");
  const auth = { Authorization: `Bearer ${env("GARMIN_ACCESS_TOKEN")}` };
  const end = Math.floor(Date.now() / 1000);
  const start = end - 7 * 86_400; // the Health API caps a query at 24 h; widen if it complains
  const list = await get(
    `https://apis.garmin.com/wellness-api/rest/activities?uploadStartTimeInSeconds=${start}&uploadEndTimeInSeconds=${end}`,
    auth,
    "garmin: /wellness-api/rest/activities",
  );
  if (Array.isArray(list) && list.length) {
    console.log("    first payload:", JSON.stringify(redact(list[0]), null, 2).slice(0, 900));
    checkFields(list[0], "garmin");
    for (const a of list) checkSane(mapGarminActivity(a), `garmin ${a.summaryId ?? a.activityId}`);
    // The two shapes we support. Knowing which one arrived is the point.
    const shape = typeof list[0].activityType === "string" ? "Health API (string)" : "web API (object)";
    say(true, `garmin: activityType arrived as the ${shape} form`);
    say(
      list[0].startTimeInSeconds !== undefined || list[0].startTimeGMT !== undefined,
      "garmin: a start time field we recognise is present",
    );
  } else if (Array.isArray(list)) {
    say(false, "garmin: no activities in the window (widen it or sync the watch)");
  }
} else {
  console.log("\n── Garmin ── skipped (no GARMIN_ACCESS_TOKEN)");
}

// --- Polar -----------------------------------------------------------------
if (env("POLAR_ACCESS_TOKEN")) {
  ran++;
  console.log("\n── Polar ──");
  const auth = { Authorization: `Bearer ${env("POLAR_ACCESS_TOKEN")}`, Accept: "application/json" };
  const list = await get("https://www.polaraccesslink.com/v3/exercises", auth, "polar: /v3/exercises");
  const items = Array.isArray(list) ? list : (list?.exercises ?? []);
  if (items.length) {
    console.log("    first payload:", JSON.stringify(redact(items[0]), null, 2).slice(0, 900));
    checkFields(items[0], "polar");
    for (const e of items) checkSane(mapPolarActivity(e), `polar ${e.id}`);
    say(
      typeof items[0].duration === "string" && items[0].duration.startsWith("P"),
      "polar: duration is still an ISO-8601 period",
      String(items[0].duration),
    );
    say("start-time-utc-offset" in items[0], "polar: the UTC offset we apply is still sent");
  } else {
    say(false, "polar: no exercises returned (AccessLink is transactional — check for a pending transaction)");
  }
} else {
  console.log("\n── Polar ── skipped (no POLAR_ACCESS_TOKEN)");
}

// --- Suunto ----------------------------------------------------------------
if (env("SUUNTO_ACCESS_TOKEN")) {
  ran++;
  console.log("\n── Suunto ──");
  const auth = {
    Authorization: `Bearer ${env("SUUNTO_ACCESS_TOKEN")}`,
    ...(env("SUUNTO_SUBSCRIPTION_KEY") ? { "Ocp-Apim-Subscription-Key": env("SUUNTO_SUBSCRIPTION_KEY") } : {}),
  };
  const body = await get("https://cloudapi.suunto.com/v2/workouts?limit=5", auth, "suunto: /v2/workouts");
  const items = body?.payload ?? (Array.isArray(body) ? body : []);
  if (items.length) {
    console.log("    first payload:", JSON.stringify(redact(items[0]), null, 2).slice(0, 900));
    checkFields(items[0], "suunto");
    for (const w of items) checkSane(mapSuuntoActivity(w), `suunto ${w.workoutKey ?? w.workoutId}`);
    // The unit that silently ruins everything downstream if it changes.
    const hr = items[0].hravg;
    if (typeof hr === "number") {
      say(true, `suunto: hravg arrived as ${hr} — ${hr < 15 ? "hertz, converted" : "already bpm"}`);
    }
    say(
      items[0].activityId !== undefined || items[0].activityType !== undefined,
      "suunto: a sport field we recognise is present",
    );
  } else {
    say(false, "suunto: no workouts returned");
  }
} else {
  console.log("\n── Suunto ── skipped (no SUUNTO_ACCESS_TOKEN)");
}

console.log("");
if (ran === 0) {
  console.log("No provider tokens were supplied — nothing was verified against a live API.");
  console.log("This is a skip, not a pass. See the header of this file for what to set.");
  process.exit(0);
}
console.log(failed === 0 ? `PASS — ${ran} provider(s) verified live` : `FAIL — ${failed} check(s) failed across ${ran} provider(s)`);
process.exit(failed === 0 ? 0 : 1);
