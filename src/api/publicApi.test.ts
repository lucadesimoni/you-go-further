import { describe, it, expect } from "vitest";
import { v1Plan, v1Course, v1Absorption, v1Heat, v1Meta, v1Catalog, v1Events, v1EventPlan, CONTRACT_VERSION } from "./publicApi";
import { issueApiKey, checkApiKey, hashKey, publicKeyView, InMemoryApiKeyStore } from "./apiKeys";
import { RateLimiter, UsageMeter } from "./rateLimit";

const session = {
  goal: "race-preparation",
  activity: "trail-running",
  intensity: "race",
  durationMin: 300,
  bodyWeightKg: 70,
  conditions: "temperate",
};

const profile = (pts: [number, number][]) => pts.map(([km, altM]) => ({ distanceM: km * 1000, altM }));
const MOUNTAIN = profile([
  [0, 570],
  [10, 900],
  [20, 1600],
  [25, 2100],
  [32, 1400],
  [42, 600],
]);

/** Every key of an object, sorted — the shape a partner's code depends on. */
const shape = (o: unknown): string[] => Object.keys(o as object).sort();

describe("v1 contract stability", () => {
  /**
   * These are not "does it work" tests. They pin the *shape*, because on the
   * other side of this contract is a watch firmware nobody can hotfix. A field
   * disappearing has to fail here, loudly, rather than in someone's race.
   */
  it("keeps the plan response shape", () => {
    const res = v1Plan(session);
    expect(res.status).toBe(200);
    expect(shape(res.data)).toEqual(["contract", "cues", "deliverability", "engine", "notes", "phases", "platform", "target"]);
    const d = res.data as Record<string, any>;
    expect(shape(d.target)).toEqual([
      "carbPerHourG",
      "carbTotalG",
      "fluidPerHourMl",
      "hydrationSource",
      "requiresMultiTransportable",
      "sodiumPerLitreMg",
      "sodiumSource",
    ]);
    expect(shape(d.cues[0])).toEqual(["atMin", "caffeine", "carbG", "fluidMl", "kind", "label", "sodiumMg"]);
    expect(shape(d.phases[0])).toEqual(["detail", "headline", "phase", "products"]);
  });

  it("keeps the course response shape", () => {
    const res = v1Course({ session, route: MOUNTAIN, weather: { temperatureC: 20, humidityPct: 55 } });
    expect(res.status).toBe(200);
    const d = res.data as Record<string, any>;
    expect(shape(d)).toEqual(["contract", "engine", "forecast", "platform", "points", "route", "stops"]);
    expect(shape(d.route)).toEqual(["ascentM", "climbs", "distanceKm", "estimatedMin", "notes", "totalCarbG"]);
    expect(shape(d.forecast)).toEqual([
      "bonkKmFuelled",
      "bonkKmUnfuelled",
      "burnTotalG",
      "feelsLikeC",
      "finishFuelledPct",
      "finishUnfuelledPct",
      "heatRisk",
      "intakeTotalG",
      "peakFluidDeficitPct",
      "sodiumLossTotalMg",
      "storeG",
      "sweatTotalMl",
      "verdict",
      "warnings",
    ]);
    expect(shape(d.points[0])).toEqual(["altM", "atMin", "fluidDeficitPct", "fuelledPct", "km", "unfuelledPct"]);
  });

  it("stamps every response with the contract, engine and platform versions", () => {
    for (const res of [
      v1Plan(session),
      v1Course({ session, route: MOUNTAIN }),
      v1Absorption({ targetPerHourG: 90, glucoseG: 60, fructoseG: 30 }),
      v1Heat({ bodyWeightKg: 70, intensity: "race", temperatureC: 30, humidityPct: 70 }),
      v1Meta(["plan"], 60),
      v1Catalog(),
    ]) {
      const d = res.data as Record<string, string>;
      expect(d.contract).toBe(CONTRACT_VERSION);
      expect(d.engine).toMatch(/^\d+\.\d+\.\d+$/);
      expect(d.platform).toMatch(/^\d+\.\d+\.\d+$/);
    }
  });

  it("stamps an error too, so a failing call still says which contract it hit", () => {
    const res = v1Plan({ bodyWeightKg: 70 });
    expect(res.status).toBe(400);
    expect((res.data as Record<string, string>).contract).toBe(CONTRACT_VERSION);
  });
});

describe("v1 validation", () => {
  it("names the field it rejected rather than returning a bare 400", () => {
    for (const [body, field] of [
      [{ ...session, bodyWeightKg: 5 }, /bodyWeightKg/],
      [{ ...session, durationMin: -1 }, /durationMin/],
      [{ ...session, activity: "curling" }, /activity/],
      [{ ...session, intensity: "brisk" }, /intensity/],
      [{ ...session, conditions: "muggy" }, /conditions/],
    ] as const) {
      const res = v1Plan(body);
      expect(res.status).toBe(400);
      expect((res.data as Record<string, string>).detail).toMatch(field);
    }
  });

  it("defaults a missing goal rather than failing on it", () => {
    const { goal: _g, ...noGoal } = session;
    expect(v1Plan(noGoal).status).toBe(200);
  });

  it("refuses a route that is not a route", () => {
    expect(v1Course({ session, route: [] }).status).toBe(400);
    expect(v1Course({ session, route: [{ distanceM: 0, altM: 100 }] }).status).toBe(400);
    // Distance running backwards is a corrupt profile, not a descent.
    const backwards = [
      { distanceM: 0, altM: 100 },
      { distanceM: 500, altM: 120 },
      { distanceM: 200, altM: 130 },
    ];
    expect(v1Course({ session, route: backwards }).status).toBe(400);
  });

  it("caps the route size, so one request cannot become a denial of service", () => {
    const huge = Array.from({ length: 5001 }, (_, i) => ({ distanceM: i * 10, altM: 500 }));
    expect(v1Course({ session, route: huge }).status).toBe(400);
  });

  it("keeps physiology optional but uses it when given", () => {
    const estimated = v1Plan(session).data as Record<string, any>;
    const measured = v1Plan({ ...session, physiology: { sweatRateMlPerH: 1500, sweatSodiumMgPerL: 1200 } })
      .data as Record<string, any>;
    expect(estimated.target.hydrationSource).toBe("estimated");
    expect(measured.target.hydrationSource).toBe("measured");
    expect(measured.target.fluidPerHourMl).toBeGreaterThan(estimated.target.fluidPerHourMl);
  });
});

describe("v1 answers", () => {
  it("returns a plan a watch can count down to", () => {
    const d = v1Plan(session).data as Record<string, any>;
    expect(d.target.carbPerHourG).toBeGreaterThan(0);
    expect(d.cues.length).toBeGreaterThan(3);
    // Cues must be in order, or a countdown walks backwards.
    const times = d.cues.map((c: { atMin: number }) => c.atMin);
    expect([...times].sort((a: number, b: number) => a - b)).toEqual(times);
  });

  it("places feeds on the course and forecasts where the tank runs down", () => {
    const d = v1Course({ session, route: MOUNTAIN }).data as Record<string, any>;
    expect(d.route.ascentM).toBeGreaterThan(1000);
    expect(d.stops.length).toBeGreaterThan(0);
    expect(["outrun", "averted", "covered"]).toContain(d.forecast.verdict);
  });

  it("says a glucose-only mix cannot deliver 90 g/h", () => {
    const d = v1Absorption({ targetPerHourG: 90, glucoseG: 90, fructoseG: 0 }).data as Record<string, any>;
    expect(d.check.deliverable).toBe(false);
    expect(d.ceiling.ceilingG).toBe(60);
    expect(d.check.fix).toBeTruthy();
  });

  it("accepts a product mix by id, not only raw sugars", () => {
    const catalog = (v1Catalog().data as Record<string, any>).products;
    const multi = catalog.find((p: { multiTransportable: boolean }) => p.multiTransportable);
    expect(multi).toBeDefined();
    const d = v1Absorption({ targetPerHourG: 80, items: [{ productId: multi.id, servings: 2 }] }).data as Record<string, any>;
    expect(d.sources.fructoseG).toBeGreaterThan(0);
  });

  it("rejects a product id that is not in the catalog rather than silently ignoring it", () => {
    const res = v1Absorption({ targetPerHourG: 60, items: [{ productId: "not-a-product", servings: 1 }] });
    expect(res.status).toBe(400);
  });

  it("returns heat strain that rises with the heat", () => {
    const cool = v1Heat({ bodyWeightKg: 70, intensity: "race", temperatureC: 10, humidityPct: 50 }).data as Record<string, any>;
    const hot = v1Heat({ bodyWeightKg: 70, intensity: "race", temperatureC: 33, humidityPct: 80 }).data as Record<string, any>;
    expect(hot.sweatRateMlPerH).toBeGreaterThan(cool.sweatRateMlPerH);
    expect(hot.carbBurnPerHourG).toBeGreaterThan(cool.carbBurnPerHourG);
    expect(hot.risk).toBe("extreme");
  });

  it("documents itself, listing the scope each endpoint needs", () => {
    const d = v1Meta(["plan", "course"], 120).data as Record<string, any>;
    expect(d.scopes).toEqual(["plan", "course"]);
    expect(d.rateLimitPerMin).toBe(120);
    expect(d.endpoints.length).toBeGreaterThan(4);
    for (const e of d.endpoints) expect(shape(e)).toEqual(["method", "path", "scope", "summary"]);
  });
});

describe("api keys", () => {
  it("returns the secret once and stores only a hash", async () => {
    const issued = issueApiKey({ tenantId: "garmin", name: "Connect IQ pilot", environment: "production" });
    expect(issued.secret.startsWith("ygf_live_")).toBe(true);
    expect(issued.key.hash).toBe(hashKey(issued.secret));
    // The record must never carry anything replayable.
    expect(JSON.stringify(publicKeyView(issued.key))).not.toContain(issued.secret);
    expect(publicKeyView(issued.key)).not.toHaveProperty("hash");
  });

  it("marks a non-production key as a test key, because a leaked one is not an incident", () => {
    expect(issueApiKey({ tenantId: "t", name: "n", environment: "development" }).secret.startsWith("ygf_test_")).toBe(true);
  });

  it("keeps a prefix that identifies a key without being usable as one", () => {
    const issued = issueApiKey({ tenantId: "t", name: "n" });
    expect(issued.secret.startsWith(issued.key.prefix)).toBe(true);
    expect(issued.key.prefix.length).toBeLessThan(issued.secret.length - 10);
  });

  it("accepts the right key, refuses a wrong one, and knows the difference from a missing one", async () => {
    const store = new InMemoryApiKeyStore();
    const issued = issueApiKey({ tenantId: "coros", name: "prod", scopes: ["plan"] });
    await store.create(issued.key);

    expect((await checkApiKey(issued.secret, store, "plan")).ok).toBe(true);
    expect((await checkApiKey(undefined, store)).reason).toBe("missing");
    expect((await checkApiKey("ygf_test_nonsense", store)).reason).toBe("unknown");
    // Right key, wrong scope: a different failure, and a different status code.
    expect((await checkApiKey(issued.secret, store, "course")).reason).toBe("scope");
  });

  it("refuses a revoked key without forgetting it existed", async () => {
    const store = new InMemoryApiKeyStore();
    const issued = issueApiKey({ tenantId: "polar", name: "old" });
    await store.create(issued.key);
    await store.update(issued.key.id, { revokedAt: new Date().toISOString() });
    expect((await checkApiKey(issued.secret, store)).reason).toBe("revoked");
    // The row stays, so the usage it accumulated stays attributable.
    expect((await store.list("polar")).length).toBe(1);
  });

  it("will not let a patch move a key to another tenant", async () => {
    const store = new InMemoryApiKeyStore();
    const issued = issueApiKey({ tenantId: "a", name: "n" });
    await store.create(issued.key);
    const patched = await store.update(issued.key.id, { tenantId: "b", hash: "x" } as never);
    expect(patched?.tenantId).toBe("a");
    expect(patched?.hash).toBe(issued.key.hash);
  });

  it("clamps a nonsense rate limit rather than accepting it", () => {
    expect(issueApiKey({ tenantId: "t", name: "n", rateLimitPerMin: -5 }).key.rateLimitPerMin).toBe(1);
    expect(issueApiKey({ tenantId: "t", name: "n", rateLimitPerMin: 999_999 }).key.rateLimitPerMin).toBe(6000);
  });
});

describe("rate limiting", () => {
  it("allows a burst up to the limit, then refuses", () => {
    let now = 0;
    const rl = new RateLimiter(() => now);
    for (let i = 0; i < 10; i++) expect(rl.take("k", 10).allowed).toBe(true);
    const blocked = rl.take("k", 10);
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfterSec).toBeGreaterThan(0);
  });

  it("refills continuously rather than in a window a caller can straddle", () => {
    let now = 0;
    const rl = new RateLimiter(() => now);
    for (let i = 0; i < 60; i++) rl.take("k", 60);
    expect(rl.take("k", 60).allowed).toBe(false);
    // One second later, exactly one token is back.
    now += 1000;
    expect(rl.take("k", 60).allowed).toBe(true);
    expect(rl.take("k", 60).allowed).toBe(false);
  });

  it("keeps callers apart", () => {
    let now = 0;
    const rl = new RateLimiter(() => now);
    for (let i = 0; i < 5; i++) rl.take("a", 5);
    expect(rl.take("a", 5).allowed).toBe(false);
    expect(rl.take("b", 5).allowed).toBe(true);
  });
});

describe("usage metering", () => {
  it("counts calls per key, per endpoint, per day", () => {
    const meter = new UsageMeter(() => new Date("2026-08-04T10:00:00Z"));
    meter.record("k1", "garmin", "plan");
    meter.record("k1", "garmin", "plan");
    meter.record("k1", "garmin", "course");
    const [day] = meter.list("garmin");
    expect(day.calls).toEqual({ plan: 2, course: 1 });
    expect(day.total).toBe(3);
  });

  it("scopes to one tenant, because usage is what a licence is billed on", () => {
    const meter = new UsageMeter(() => new Date("2026-08-04T10:00:00Z"));
    meter.record("k1", "garmin", "plan");
    meter.record("k2", "coros", "plan");
    expect(meter.list("garmin")).toHaveLength(1);
    expect(meter.totalFor("garmin")).toBe(1);
    expect(meter.totalFor("coros")).toBe(1);
  });

  it("stores counts, never the requests — a partner's athlete data is not ours to hold", () => {
    const meter = new UsageMeter(() => new Date("2026-08-04T10:00:00Z"));
    meter.record("k1", "garmin", "plan");
    const json = JSON.stringify(meter.list());
    expect(json).not.toMatch(/bodyWeight|athlete|route/i);
  });
});

describe("GET /v1/events", () => {
  const list = () => (v1Events(new Date("2026-08-01T08:00:00Z")).data as Record<string, any>).events;

  it("returns the curated races with the countdown already worked out", () => {
    const jungfrau = list().find((e: any) => e.id === "jungfrau-marathon");
    expect(jungfrau.name).toBe("Jungfrau-Marathon");
    expect(jungfrau.daysOut).toBe(42);
  });

  it("makes the approximate date a field, not a footnote", () => {
    // A partner who never reads our docs still has to destructure past this to
    // render the date, which is the only warning that survives an integration.
    for (const e of list()) expect(e.dateApproximate).toBe(true);
  });

  it("says whether aid stations are known rather than sending an empty list", () => {
    for (const e of list()) expect(typeof e.aidStationsKnown).toBe("boolean");
  });

  it("carries the contract envelope", () => {
    const data = v1Events().data as Record<string, unknown>;
    expect(data.contract).toBe(CONTRACT_VERSION);
    expect(typeof data.engine).toBe("string");
  });
});

describe("POST /v1/events/{id}/plan", () => {
  const NOW = new Date("2026-08-01T08:00:00Z");
  const ok = () => v1EventPlan("jungfrau-marathon", { bodyWeightKg: 70, estimatedMin: 300 }, NOW);

  it("names the unknown event instead of 500-ing on it", async () => {
    const res = await v1EventPlan("no-such-race", { bodyWeightKg: 70 }, NOW);
    expect(res.status).toBe(404);
    expect((res.data as Record<string, unknown>).error).toBe("unknown_event");
  });

  it("validates the athlete before reaching for a forecast", async () => {
    const res = await v1EventPlan("jungfrau-marathon", { bodyWeightKg: 5 }, NOW);
    expect(res.status).toBe(400);
    expect(String((res.data as Record<string, unknown>).detail)).toContain("bodyWeightKg");
  });

  it("rejects a start hour outside the day", async () => {
    const res = await v1EventPlan("jungfrau-marathon", { bodyWeightKg: 70, startHour: 26 }, NOW);
    expect(res.status).toBe(400);
  });

  it("returns the fields a watch renders, flat", async () => {
    const d = (await ok()).data as Record<string, any>;
    expect(d.countdown.phase).toBe("build");
    expect(d.estimatedMin).toBe(300);
    expect(d.estimateSource).toBe("athlete");
    expect(d.target.carbPerHourG).toBeGreaterThan(0);
    expect(d.target.fluidPerHourMl).toBeGreaterThan(0);
  });

  it("marks whether the weather is a forecast or climatology", async () => {
    // Nine months out there is no model run, and the contract has to say so
    // rather than letting a seasonal average be rendered as a forecast.
    const d = (await ok()).data as Record<string, any>;
    expect(d.weather.forecast).toBe(false);
    expect(typeof d.weather.sourceLabel).toBe("string");
    expect(d.weather.windowFromHour).toBe(9);
  });

  it("sends advice as ids and numbers, so the partner writes the sentence", async () => {
    const d = (await ok()).data as Record<string, any>;
    expect(d.advice.length).toBeGreaterThan(0);
    for (const a of d.advice) {
      expect(typeof a.id).toBe("string");
      expect(["info", "act"]).toContain(a.severity);
      expect(Object.values(a.values).every((v) => typeof v === "number")).toBe(true);
    }
  });
});
