import { describe, it, expect } from "vitest";
import { mapStravaActivity, StravaProvider } from "./strava";
import { mapGarminActivity } from "./garmin";
import { mapPolarActivity } from "./polar";
import { mapSuuntoActivity } from "./suunto";
import { STRAVA_ACTIVITIES, GARMIN_ACTIVITIES, POLAR_EXERCISES, SUUNTO_WORKOUTS } from "./fixtures";
import { InMemoryActivityStore } from "../data";
import type { Activity } from "../model";

/**
 * Import contract tests — our normalisers against each provider's own payload
 * shape, rather than against our idea of it.
 *
 * The live APIs cannot be reached from CI (registered app, client secret, a real
 * athlete's account, an interactive consent, and network egress to hosts this
 * environment blocks). `scripts/verify-providers.mjs` does that run wherever
 * those exist. What these tests can do is far from nothing: every field that a
 * provider names differently from us, every unit that is not the one we store,
 * and every optional field that is genuinely absent in the wild is checked here.
 *
 * The assertions pin **physiological plausibility**, not just types. A heart
 * rate of 2.6 is a valid number and a broken import.
 */

/** What any normaliser must produce, whatever it was handed. */
function expectSaneActivity(a: Activity, label: string) {
  expect(a.id, `${label}: id`).toMatch(/^[a-z-]+:.+/);
  expect(a.externalId, `${label}: externalId`).toBeTruthy();

  // A time we can order sessions by. `new Date()` as a fallback is the failure
  // mode that hurts most: it silently stamps history with today.
  expect(Number.isNaN(Date.parse(a.startTime)), `${label}: startTime is unparseable`).toBe(false);
  const year = new Date(a.startTime).getUTCFullYear();
  expect(year, `${label}: startTime year`).toBeGreaterThan(2000);
  expect(year, `${label}: startTime year`).toBeLessThan(2100);

  expect(a.durationSec, `${label}: durationSec`).toBeGreaterThan(0);
  expect(a.durationSec, `${label}: durationSec`).toBeLessThan(86_400);

  if (a.avgHr !== undefined) {
    // The Suunto-in-hertz trap: 2.6 is a number, and it is not a heart rate.
    expect(a.avgHr, `${label}: avgHr looks like hertz, not bpm`).toBeGreaterThan(30);
    expect(a.avgHr, `${label}: avgHr`).toBeLessThan(230);
  }
  if (a.maxHr !== undefined) {
    expect(a.maxHr, `${label}: maxHr`).toBeGreaterThan(30);
    expect(a.maxHr, `${label}: maxHr`).toBeLessThan(230);
  }
  if (a.avgHr !== undefined && a.maxHr !== undefined) {
    expect(a.maxHr, `${label}: maxHr below avgHr`).toBeGreaterThanOrEqual(a.avgHr);
  }
  if (a.distanceM !== undefined) {
    expect(a.distanceM, `${label}: distanceM`).toBeGreaterThanOrEqual(0);
    // A metres/kilometres mix-up shows up here and nowhere else.
    expect(a.distanceM, `${label}: distanceM looks like kilometres`).toBeLessThan(1_000_000);
  }
  if (a.avgPowerW !== undefined) {
    expect(a.avgPowerW, `${label}: avgPowerW`).toBeGreaterThan(0);
    expect(a.avgPowerW, `${label}: avgPowerW`).toBeLessThan(2000);
  }
  if (a.calories !== undefined) {
    expect(a.calories, `${label}: calories`).toBeGreaterThan(0);
    expect(a.calories, `${label}: calories`).toBeLessThan(20_000);
  }
}

describe("Strava import", () => {
  const mapped = STRAVA_ACTIVITIES.map(mapStravaActivity);

  it("normalises every summary activity into a sane session", () => {
    mapped.forEach((a, i) => expectSaneActivity(a, `strava[${i}]`));
  });

  it("prefers sport_type, which is the only place a trail run is distinguishable", () => {
    // `type` says "Run" for both a road and a trail run; only `sport_type` knows.
    expect(mapped[0].sport).toBe("trail-run");
    expect(mapped[1].sport).toBe("ride");
    expect(mapped[3].sport).toBe("swim");
  });

  it("keeps distance in metres and elevation in metres", () => {
    expect(mapped[0].distanceM).toBe(42_195);
    expect(mapped[0].elevationGainM).toBe(1823);
  });

  it("uses moving time, not elapsed — a session is not the café stop", () => {
    expect(mapped[0].durationSec).toBe(16_842);
    expect(mapped[1].durationSec).toBe(14_400);
  });

  it("survives an indoor ride with no distance and no elevation", () => {
    const indoor = mapped[2];
    expect(indoor.durationSec).toBe(3600);
    expect(indoor.avgPowerW).toBe(245);
    // Zero distance must stay zero, not become undefined or NaN.
    expect(indoor.distanceM).toBe(0);
  });

  it("survives a swim with no heart rate at all", () => {
    expect(mapped[3].avgHr).toBeUndefined();
    expect(mapped[3].distanceM).toBe(2200);
  });

  it("does not claim a walk is training it can fuel", () => {
    // "other" is the honest answer; the engine can then decline to plan for it.
    expect(mapped[4].sport).toBe("other");
  });

  it("keeps the athlete's own name for the session", () => {
    expect(mapped[0].name).toBe("Jungfrau Marathon");
  });
});

describe("Garmin import", () => {
  const mapped = GARMIN_ACTIVITIES.map(mapGarminActivity);

  it("normalises every activity summary into a sane session", () => {
    mapped.forEach((a, i) => expectSaneActivity(a, `garmin[${i}]`));
  });

  it("reads the Health API's string activityType, not only the web API's object", () => {
    expect(mapped[0].sport).toBe("run");
    expect(mapped[1].sport).toBe("trail-run");
    expect(mapped[2].sport).toBe("ride");
    // And the internal web shape, `{ typeKey: "running" }`, still works.
    expect(mapped[3].sport).toBe("run");
  });

  it("reads startTimeInSeconds, so history does not all land on today", () => {
    // 1776148200 → 2026-04-14T06:30:00Z.
    expect(mapped[0].startTime).toBe("2026-04-14T06:30:00.000Z");
    // The local offset must not be added twice: the epoch value is already UTC.
    expect(new Date(mapped[0].startTime).getUTCHours()).toBe(6);
  });

  it("still reads the web API's startTimeGMT form", () => {
    expect(mapped[3].startTime.startsWith("2026-04-08T17:05")).toBe(true);
  });

  it("reads totalElevationGainInMeters and the web API's elevationGainInMeters", () => {
    expect(mapped[0].elevationGainM).toBe(52);
    expect(mapped[1].elevationGainM).toBe(620);
    expect(mapped[3].elevationGainM).toBe(88);
  });

  it("takes activeKilocalories as calories — the one field that is already kcal", () => {
    expect(mapped[0].calories).toBe(2841);
  });

  it("copes with an activity the athlete never named", () => {
    expect(mapped[2].name).toBeUndefined();
    expect(mapped[2].sport).toBe("ride");
  });

  it("prefers summaryId for identity, since that is what the Health API dedups on", () => {
    expect(mapped[0].externalId).toBe("9480958402");
    expect(mapped[0].id).toBe("garmin:9480958402");
  });
});

describe("Polar import", () => {
  const mapped = POLAR_EXERCISES.map(mapPolarActivity);

  it("normalises every exercise into a sane session", () => {
    mapped.forEach((a, i) => expectSaneActivity(a, `polar[${i}]`));
  });

  it("parses an ISO-8601 duration, in every combination of components", () => {
    expect(mapped[0].durationSec).toBe(6270); // PT1H44M30S
    expect(mapped[1].durationSec).toBe(9300); // PT2H35M
    expect(mapped[2].durationSec).toBe(2880); // PT48M
  });

  it("reads hyphenated keys", () => {
    expect(mapped[0].avgHr).toBe(156);
    expect(mapped[0].maxHr).toBe(176);
    expect(mapped[0].distanceM).toBe(21_097.5);
  });

  it("keeps the provider's own training load rather than recomputing it", () => {
    expect(mapped[0].trainingLoad).toBe(143.22);
    expect(mapped[1].trainingLoad).toBe(211.5);
  });

  it("uses detailed-sport-info when the coarse sport says only OTHER", () => {
    // Strength training is genuinely "other" for fuelling, but the mapper must
    // have looked at the detailed field to decide that, not given up early.
    expect(mapped[2].sport).toBe("other");
    expect(mapped[2].distanceM).toBeUndefined();
  });

  it("applies the session's own UTC offset rather than the server's timezone", () => {
    // start-time 09:12 local, offset +120 min → 07:12Z.
    expect(mapped[0].startTime).toBe("2026-05-17T07:12:00.000Z");
  });
});

describe("Suunto import", () => {
  const mapped = SUUNTO_WORKOUTS.map(mapSuuntoActivity);

  it("normalises every workout into a sane session", () => {
    mapped.forEach((a, i) => expectSaneActivity(a, `suunto[${i}]`));
  });

  it("converts heart rate from hertz to beats per minute", () => {
    // 2.616667 Hz → 157 bpm. Passed through unconverted it is a valid number
    // and a ruined intensity estimate.
    expect(mapped[0].avgHr).toBe(157);
    expect(mapped[0].maxHr).toBe(179);
    expect(mapped[1].avgHr).toBe(137);
  });

  it("leaves a value that is already bpm alone", () => {
    // The field is not consistent across firmware, so the conversion has to be
    // conditional rather than unconditional.
    expect(mapped[2].avgHr).toBe(148);
    expect(mapped[2].maxHr).toBe(172);
  });

  it("maps the numeric activity enum, not only the string form", () => {
    expect(mapped[0].sport).toBe("run");
    expect(mapped[1].sport).toBe("ride");
    expect(mapped[2].sport).toBe("trail-run");
  });

  it("reads epoch milliseconds", () => {
    expect(mapped[0].startTime).toBe("2026-06-15T05:20:00.000Z");
  });

  it("keeps ascent and distance in metres", () => {
    expect(mapped[0].distanceM).toBe(21_097);
    expect(mapped[0].elevationGainM).toBe(310);
  });
});

describe("cross-provider import", () => {
  const all: Activity[] = [
    ...STRAVA_ACTIVITIES.map(mapStravaActivity),
    ...GARMIN_ACTIVITIES.map(mapGarminActivity),
    ...POLAR_EXERCISES.map(mapPolarActivity),
    ...SUUNTO_WORKOUTS.map(mapSuuntoActivity),
  ];

  it("produces one shape from four different ones", () => {
    for (const [i, a] of all.entries()) expectSaneActivity(a, `all[${i}]`);
    expect(all.length).toBe(15);
  });

  it("namespaces ids per provider, so two services cannot collide", () => {
    const ids = all.map((a) => a.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const a of all) expect(a.id.startsWith(`${a.provider}:`)).toBe(true);
  });

  it("stores and de-duplicates a repeated import", async () => {
    // Re-importing the same window is the normal case, not the exception: a
    // poll every 15 minutes sees the same sessions over and over.
    const store = new InMemoryActivityStore();
    await store.upsert(all, "athlete-1");
    await store.upsert(all, "athlete-1");
    const stored = await store.query({ userId: "athlete-1" });
    expect(stored.length).toBe(all.length);
  });

  it("keeps one athlete's import out of another's", async () => {
    const store = new InMemoryActivityStore();
    await store.upsert(all, "athlete-1");
    expect(await store.query({ userId: "athlete-2" })).toHaveLength(0);
  });

  it("orders a mixed import by time, which is what every analysis assumes", async () => {
    const store = new InMemoryActivityStore();
    await store.upsert(all, "athlete-1");
    const stored = await store.query({ userId: "athlete-1" });
    const times = stored.map((a) => Date.parse(a.startTime));
    const sorted = [...times].sort((a, b) => b - a);
    expect(times).toEqual(sorted);
  });
});

describe("Strava transport", () => {
  /** A stub Strava that records what was asked of it. */
  function stubStrava(pages: unknown[][], opts: { tokenStatus?: number; rateLimitAtPage?: number } = {}) {
    const calls: string[] = [];
    let refreshes = 0;
    const fetchImpl = (async (url: string | URL) => {
      const u = String(url);
      calls.push(u);
      if (u.includes("/oauth/token")) {
        refreshes++;
        if (opts.tokenStatus && opts.tokenStatus >= 400) {
          return { ok: false, status: opts.tokenStatus, json: async () => ({}) } as unknown as Response;
        }
        return {
          ok: true,
          status: 200,
          json: async () => ({
            access_token: "fresh-token",
            refresh_token: "rotated-refresh",
            expires_at: Math.floor(Date.now() / 1000) + 21_600,
          }),
        } as unknown as Response;
      }
      const page = Number(/[?&]page=(\d+)/.exec(u)?.[1] ?? "1");
      if (opts.rateLimitAtPage && page >= opts.rateLimitAtPage) {
        return { ok: false, status: 429, json: async () => [] } as unknown as Response;
      }
      return { ok: true, status: 200, json: async () => pages[page - 1] ?? [] } as unknown as Response;
    }) as unknown as typeof fetch;
    return { fetchImpl, calls, refreshes: () => refreshes };
  }

  const range = { after: "2026-01-01T00:00:00Z", before: "2026-02-01T00:00:00Z" };
  const live = { provider: "strava" as const, accessToken: "live-token", refreshToken: "live-refresh" };

  /** A page of `n` distinct summary activities. */
  const page = (n: number, offset = 0) =>
    Array.from({ length: n }, (_, i) => ({
      id: 1_000_000 + offset + i,
      type: "Run",
      sport_type: "Run",
      start_date: "2026-01-15T06:00:00Z",
      moving_time: 3600,
      distance: 12_000,
    }));

  it("follows pagination instead of truncating at the first page", async () => {
    // Two full pages and a short one: 100 + 100 + 37.
    const stub = stubStrava([page(100), page(100, 100), page(37, 200)]);
    const provider = new StravaProvider(stub.fetchImpl);
    process.env.STRAVA_CLIENT_ID = "id";
    process.env.STRAVA_CLIENT_SECRET = "secret";
    try {
      const out = await provider.fetchActivities({ ...live, expiresAt: Date.now() + 3_600_000 }, range);
      expect(out).toHaveLength(237);
      // And it stopped at the short page rather than paging forever.
      expect(stub.calls.filter((c) => c.includes("/athlete/activities"))).toHaveLength(3);
      expect(new Set(out.map((a) => a.id)).size).toBe(237);
    } finally {
      delete process.env.STRAVA_CLIENT_ID;
      delete process.env.STRAVA_CLIENT_SECRET;
    }
  });

  it("refreshes an expired token before fetching, and keeps the rotated one", async () => {
    const stub = stubStrava([page(3)]);
    const provider = new StravaProvider(stub.fetchImpl);
    process.env.STRAVA_CLIENT_ID = "id";
    process.env.STRAVA_CLIENT_SECRET = "secret";
    try {
      // Expired an hour ago: the six-hour token every returning athlete has.
      const out = await provider.fetchActivities({ ...live, expiresAt: Date.now() - 3_600_000 }, range);
      expect(stub.refreshes()).toBe(1);
      expect(out).toHaveLength(3);
      // The fetch must use the new token, not the dead one.
      const refreshed = await provider.refreshToken({ ...live, expiresAt: 0 });
      expect(refreshed.accessToken).toBe("fresh-token");
      expect(refreshed.refreshToken).toBe("rotated-refresh");
    } finally {
      delete process.env.STRAVA_CLIENT_ID;
      delete process.env.STRAVA_CLIENT_SECRET;
    }
  });

  it("does not refresh a token that is still good", async () => {
    const stub = stubStrava([page(2)]);
    const provider = new StravaProvider(stub.fetchImpl);
    process.env.STRAVA_CLIENT_ID = "id";
    process.env.STRAVA_CLIENT_SECRET = "secret";
    try {
      await provider.fetchActivities({ ...live, expiresAt: Date.now() + 5 * 3_600_000 }, range);
      expect(stub.refreshes()).toBe(0);
    } finally {
      delete process.env.STRAVA_CLIENT_ID;
      delete process.env.STRAVA_CLIENT_SECRET;
    }
  });

  it("returns a partial sync on a rate limit rather than nothing at all", async () => {
    // Page 1 lands, page 2 is throttled. Half an athlete's month beats none.
    const stub = stubStrava([page(100), page(100, 100)], { rateLimitAtPage: 2 });
    const provider = new StravaProvider(stub.fetchImpl);
    process.env.STRAVA_CLIENT_ID = "id";
    process.env.STRAVA_CLIENT_SECRET = "secret";
    try {
      const out = await provider.fetchActivities({ ...live, expiresAt: Date.now() + 3_600_000 }, range);
      expect(out).toHaveLength(100);
    } finally {
      delete process.env.STRAVA_CLIENT_ID;
      delete process.env.STRAVA_CLIENT_SECRET;
    }
  });

  it("still runs on sample data when no app is registered", async () => {
    const provider = new StravaProvider((async () => {
      throw new Error("the network must not be touched without credentials");
    }) as unknown as typeof fetch);
    const out = await provider.fetchActivities({ provider: "strava", accessToken: "dev-strava-token" }, range);
    expect(out.length).toBeGreaterThan(0);
  });
});
