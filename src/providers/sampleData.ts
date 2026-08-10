import type { Activity, LatLng, ProviderId, SportType } from "../model";

/**
 * Deterministic sample-activity generator. Stands in for a live provider API so
 * the ingestion pipeline, storage, and analysis are fully runnable and testable
 * without OAuth credentials. Real adapters replace this with normalized API data.
 *
 * Two properties matter more than they look, because this data is what the
 * demo, the screenshots and every e2e run are judged on.
 *
 * **A session has a stable identity.** Everything here is keyed on the calendar
 * day it happened, not on when you asked. The generator used to seed from the
 * *window start* — a full millisecond-precision timestamp — so two calls a
 * millisecond apart returned 19 and 21 sessions with no ids in common: 502 km
 * of training one render, 586 km the next, and a demo whose history reset every
 * time the page moved. Worse, `externalId` was that same millisecond, so the
 * same run synced twice was two different activities and deduplication could
 * never match anything. Now the session on 14 July is the same session with the
 * same id whoever asks and whenever; a window only decides which days are
 * returned.
 *
 * **A week looks like a week.** Sessions used to be drawn one per day at
 * random, which gives a training history with no rest days, no weekend long
 * run and no build/recovery rhythm — noise that the acute:chronic ratio and
 * the fitness/fatigue model then dutifully analysed. The pattern below is the
 * ordinary shape of an amateur endurance week, so what the analysis reads is
 * training rather than a random walk.
 */

// A tiny seeded PRNG so generated data is stable across runs (good for tests).
function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const DAY_MS = 86_400_000;

/** Day number since the Unix epoch — a session's stable identity. */
const dayIndexOf = (t: number) => Math.floor(t / DAY_MS);

/** 1970-01-01 was a Thursday, so this yields 0 = Sunday … 6 = Saturday. */
const weekdayOf = (day: number) => ((day + 4) % 7 + 7) % 7;

const SPORTS_BY_PROVIDER: Record<ProviderId, SportType[]> = {
  strava: ["run", "ride", "trail-run"],
  garmin: ["run", "ride", "swim", "triathlon"],
  polar: ["run", "ride"],
  suunto: ["trail-run", "run"],
  // Phone-recorded sessions skew to what people log without a bike computer.
  "apple-health": ["run", "ride", "other"],
  "google-health": ["run", "ride", "other"],
};

/** Real Swiss trailheads the sample routes loop out from. */
const SWISS_STARTS: LatLng[] = [
  [47.3769, 8.5417], // Zürich
  [47.0502, 8.3093], // Lucerne
  [46.5197, 6.6323], // Lausanne
  [46.6863, 7.8632], // Interlaken
  [46.0037, 7.7491], // Zermatt
];

/**
 * The shape of an ordinary training week, Sunday first.
 *
 * Not a coaching prescription — the point is only that it *has* a shape: two
 * rest days, quality separated by easy running, and the long day at the
 * weekend. A history without that shape makes the acute:chronic ratio and the
 * form curve read noise.
 */
type SessionKind = "rest" | "easy" | "quality" | "medium" | "long";
const WEEK: SessionKind[] = ["long", "rest", "quality", "easy", "quality", "rest", "medium"];

/** Every fourth week is a recovery week — less volume, no second quality day. */
const RECOVERY_EVERY = 4;
const RECOVERY_VOLUME = 0.65;

/** Minutes per session kind, before the sport and the week's cycle adjust it. */
const MINUTES: Record<Exclude<SessionKind, "rest">, [number, number]> = {
  easy: [38, 62],
  quality: [55, 80],
  medium: [70, 105],
  long: [100, 205],
};

/** Fraction of max heart rate, by how hard the session is meant to be. */
const HR_FRAC: Record<Exclude<SessionKind, "rest">, [number, number]> = {
  easy: [0.62, 0.71],
  quality: [0.80, 0.91],
  medium: [0.68, 0.76],
  long: [0.67, 0.78],
};

/** Session titles, the way they actually arrive from a provider. */
const NAMES: Record<Exclude<SessionKind, "rest">, string[]> = {
  easy: ["Easy run", "Recovery jog", "Morning shakeout", "Easy spin"],
  quality: ["Threshold intervals", "Tempo session", "Hill repeats", "5×1000 m"],
  medium: ["Steady ride", "Progression run", "Midweek long", "Rolling loop"],
  long: ["Long run", "Long ride", "Weekend long one", "Sunday endurance"],
};

/**
 * Synthesize a plausible outdoor GPS loop (a smooth closed path) of roughly the
 * given distance, starting from the athlete's home trailhead. Deterministic
 * given the PRNG. Stands in for a provider's recorded track until a real
 * account is linked.
 */
function generateRoute(rand: () => number, distanceM: number, home: LatLng, points = 72): LatLng[] {
  const [lat0, lng0] = home;
  const radiusM = Math.max(300, distanceM / (2 * Math.PI));
  const mPerDegLat = 111_320;
  const mPerDegLng = 111_320 * Math.cos((lat0 * Math.PI) / 180);
  // Loop shape held constant across the sweep so the path is smooth and closes.
  const harmonics = 2 + Math.floor(rand() * 3); // 2–4 lobes
  const wobble = 0.2 + rand() * 0.35;
  const phase = rand() * Math.PI * 2;
  const rotate = rand() * Math.PI * 2;
  const drift = 0.12 * (rand() - 0.5);

  const route: LatLng[] = [];
  for (let i = 0; i <= points; i++) {
    const f = i / points;
    const a = rotate + f * Math.PI * 2;
    const r = radiusM * (1 + wobble * Math.sin(harmonics * a + phase) + drift * Math.sin(a));
    const dLat = (r * Math.sin(a)) / mPerDegLat;
    const dLng = (r * Math.cos(a)) / mPerDegLng;
    route.push([Number((lat0 + dLat).toFixed(5)), Number((lng0 + dLng).toFixed(5))]);
  }
  return route;
}

function hashSeed(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Pick from a list with a uniform draw. */
const pick = <T,>(rand: () => number, xs: readonly T[]): T => xs[Math.floor(rand() * xs.length)];
const between = (rand: () => number, [lo, hi]: [number, number]) => lo + rand() * (hi - lo);

/**
 * Which sport a given kind of session is done in, restricted to what the
 * provider actually records. Long days go to the endurance sports, quality
 * days to running, and a swim only ever lands on an easy day.
 */
function sportFor(kind: Exclude<SessionKind, "rest">, available: SportType[], rand: () => number): SportType {
  const prefer: SportType[] =
    kind === "long"
      ? ["trail-run", "ride", "run"]
      : kind === "quality"
        ? ["run", "trail-run", "ride"]
        : kind === "medium"
          ? ["ride", "run", "trail-run"]
          : ["run", "swim", "ride", "other"];
  const candidates = prefer.filter((s) => available.includes(s));
  if (candidates.length === 0) return available[0];
  // Weighted to the front of the preference list without being rigid about it.
  const idx = rand() < 0.6 ? 0 : 1 + Math.floor(rand() * Math.max(1, candidates.length - 1));
  return candidates[Math.min(idx, candidates.length - 1)];
}

/**
 * The athlete's home trailhead. Fixed per athlete, so a training history reads
 * as one person's — the generator used to draw a new Swiss start per session,
 * which put someone in Zürich on Tuesday and Zermatt on Wednesday.
 */
function homeFor(key: string): LatLng {
  return SWISS_STARTS[hashSeed(`home:${key}`) % SWISS_STARTS.length];
}

export interface SampleOptions {
  /** Max heart rate, for plausible HR values. */
  maxHr?: number;
  /**
   * Distinguishes athletes who use the same provider. Without it every athlete
   * on Strava trains identically, which a squad view shows up immediately.
   */
  athleteKey?: string;
}

/**
 * Generate the athlete's sessions that fall inside `[afterIso, beforeIso]`.
 *
 * The window selects; it does not generate. Ask for 28 days or 90 and the days
 * you get back are the same days, which is what makes a demo hold still.
 */
export function generateSampleActivities(
  provider: ProviderId,
  afterIso: string,
  beforeIso: string,
  maxHrOrOptions: number | SampleOptions = 190,
): Activity[] {
  const opts: SampleOptions = typeof maxHrOrOptions === "number" ? { maxHr: maxHrOrOptions } : maxHrOrOptions;
  const maxHr = opts.maxHr ?? 190;
  const athlete = opts.athleteKey ?? provider;
  const after = Date.parse(afterIso);
  const before = Date.parse(beforeIso);
  if (!Number.isFinite(after) || !Number.isFinite(before) || before <= after) return [];

  const available = SPORTS_BY_PROVIDER[provider];
  const home = homeFor(athlete);
  const out: Activity[] = [];

  // Whole calendar days only. `after` mid-morning still yields that whole day's
  // session or none of it, never half of one.
  const firstDay = dayIndexOf(after);
  const lastDay = dayIndexOf(before);

  for (let day = firstDay; day <= lastDay; day++) {
    const kind = WEEK[weekdayOf(day)];
    // Seeded on the day itself: this session is this session, for good.
    const rand = mulberry32(hashSeed(`${athlete}:${provider}:${day}`));
    const week = Math.floor(day / 7);
    const recovery = week % RECOVERY_EVERY === RECOVERY_EVERY - 1;

    let actual: SessionKind = kind;
    // A rest day is occasionally an easy hour anyway; a recovery week drops its
    // second quality session rather than shortening it.
    if (kind === "rest") actual = rand() < 0.18 ? "easy" : "rest";
    else if (recovery && kind === "quality" && weekdayOf(day) === 4) actual = rand() < 0.5 ? "easy" : "rest";
    if (actual === "rest") continue;
    // Life happens: roughly one planned session in twelve does not get done.
    if (rand() < 0.08) continue;

    const sport = sportFor(actual, available, rand);
    const volumeScale = (recovery ? RECOVERY_VOLUME : 1) * (0.9 + rand() * 0.2);

    /**
     * A swim is not a four-hour session, whatever the day's template says.
     * Capping it here rather than sharing the running range is what stops the
     * generator inventing a 12 km pool swim.
     */
    const minutes =
      sport === "swim"
        ? between(rand, [30, 60])
        : between(rand, MINUTES[actual]) * volumeScale * (sport === "ride" ? 1.45 : 1);
    const durationSec = Math.round(minutes * 60);

    const hrFrac = between(rand, HR_FRAC[actual]);
    const avgHr = Math.round(maxHr * hrFrac);

    /**
     * Pace decays with duration, which is the whole point of endurance.
     *
     * Drawing speed independently of duration let a 3.5-hour run come out at
     * 4:24/km for 48 km — a number no amateur produces. The decay is a plain
     * power law: roughly 6 % slower per doubling of time, which is the shape of
     * the real curve without pretending to be Riegel's exact exponent.
     */
    const hours = durationSec / 3600;
    const decay = Math.pow(Math.max(0.5, hours), -0.09);
    // Quality sessions are run faster than easy ones — the intensity has to
    // show up in the pace, or every session looks the same in the data. The
    // base spread is deliberately narrower than the effort range is wide, so
    // that a hard day shifts the *centre* rather than pushing the fastest
    // sample past what an amateur actually runs.
    const effort = actual === "quality" ? 1.1 : actual === "easy" ? 0.94 : 1;
    const baseMs = sport === "ride" ? 6.8 + rand() * 3.0 : sport === "swim" ? 0.95 + rand() * 0.35 : 2.55 + rand() * 0.95;
    const speedMs = baseMs * decay * effort;
    const distanceM = Math.round(durationSec * speedMs);

    /**
     * Indoors: a trainer, a treadmill, a pool. No GPS, no ascent — and it is
     * where a plan has to cope with a session that has no route at all. Sample
     * data in which every session has a track never exercises that path.
     *
     * Winter drives more of it indoors, which is both true and a better test:
     * the share changes across the year instead of being a constant.
     */
    const month = new Date(day * DAY_MS).getUTCMonth();
    const winter = month <= 1 || month >= 10;
    const indoorChance = sport === "trail-run" ? 0 : winter ? 0.34 : 0.14;
    const indoor = sport === "swim" || rand() < indoorChance;

    /**
     * Ascent, Swiss. A road ride here climbs 8–20 m/km and a trail run 25–55,
     * where a flat 100 km ride with 250 m of climbing would be a Dutch polder.
     */
    const ascentPerKm = sport.includes("trail") ? 25 + rand() * 30 : sport === "ride" ? 8 + rand() * 12 : 5 + rand() * 15;
    const elevationGainM = indoor ? 0 : Math.round((distanceM / 1000) * ascentPerKm);

    /**
     * When people actually train: the long day starts in the morning, and a
     * weekday session is before work or after it.
     */
    const weekday = weekdayOf(day);
    const isWeekend = weekday === 0 || weekday === 6;
    const startHour = isWeekend || actual === "long" ? 7 + Math.floor(rand() * 3) : rand() < 0.5 ? 6 + Math.floor(rand() * 2) : 17 + Math.floor(rand() * 3);
    const startMin = Math.floor(rand() * 12) * 5;

    // The calendar day *is* the identity, so the same session synced twice is
    // recognised as the same session and deduplication actually works.
    const externalId = `${new Date(day * DAY_MS).toISOString().slice(0, 10)}`;
    out.push({
      id: `${provider}:${externalId}`,
      provider,
      externalId,
      sport,
      startTime: new Date(day * DAY_MS + startHour * 3600_000 + startMin * 60_000).toISOString(),
      durationSec,
      distanceM,
      elevationGainM,
      avgHr,
      maxHr: Math.min(maxHr, avgHr + Math.round(8 + rand() * 20)),
      avgPowerW: sport === "ride" ? Math.round(160 + rand() * 140) : undefined,
      calories: Math.round((durationSec / 60) * (7 + rand() * 6)),
      trainingLoad: provider === "strava" ? undefined : Math.round((durationSec / 60) * hrFrac * 2.2),
      // Outdoor sessions carry a GPS track; a trainer or a pool does not.
      route: indoor ? undefined : generateRoute(rand, distanceM, home),
      name: indoor && sport !== "swim" ? `${pick(rand, NAMES[actual])} (indoor)` : pick(rand, NAMES[actual]),
    });
  }
  // Newest first is what every provider API returns, and what the UI expects.
  return out.reverse();
}
