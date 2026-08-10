import {
  computeTarget,
  buildSchedule,
  recommend,
  planRouteFuelling,
  simulateRace,
  heatStrain,
  absorptionCeiling,
  checkDeliverable,
  productCarbSources,
  sumCarbSources,
  carbBurnPerHourG,
  CATALOG,
  type AthleteInput,
  type Product,
  type Intensity,
} from "../engine";
import type { ElevationSample } from "../geo/swisstopo";
import { SWISS_EVENTS, eventById, eventCountdown, planEvent } from "../events";
import { moduleVersion, PLATFORM_VERSION } from "../version";

/**
 * The public engine API — `/v1`.
 *
 * The vision's Phase 6 is explicit that the app is the entry point and the
 * engine is the product: licensed to a wearable maker, or embedded in a training
 * platform. Phase 2 needs the same thing sooner, because a Garmin Connect IQ app
 * is exactly that — a third-party client calling the engine over HTTP.
 *
 * So this is a *contract*, not an export of internal shapes. It is deliberately
 * separate from `/api/*`:
 *
 * - **`/api/*` serves our own app** and may change whenever the app does. Its
 *   request shapes are our internal domain types.
 * - **`/v1/*` is somebody else's dependency.** It has its own version, its own
 *   flattened response shapes, and a test that fails if a field disappears —
 *   because on the other side of it is a watch firmware nobody can hotfix.
 *
 * Every response carries `engine` and `contract` versions, so a partner can tell
 * an engine improvement from a contract change without reading a changelog.
 *
 * What it deliberately does not do: no athlete identity, no storage, no history.
 * A request carries everything the answer needs. That keeps the licensable
 * surface a pure function of its input — the property that makes it embeddable
 * in someone else's product without dragging our database along.
 */

/**
 * The contract version, moved independently of both the platform and the engine.
 *
 * A breaking change means `/v2`, not a bump here — this number moves for
 * additive changes so a partner can tell which fields they can rely on.
 */
export const CONTRACT_VERSION = "1.1.0";

interface Envelope {
  contract: string;
  engine: string;
  platform: string;
}

const envelope = (): Envelope => ({
  contract: CONTRACT_VERSION,
  engine: moduleVersion("engine"),
  platform: PLATFORM_VERSION,
});

export interface PublicResult {
  status: number;
  data: unknown;
}

const fail = (status: number, error: string, detail?: string): PublicResult => ({
  status,
  data: { error, ...(detail ? { detail } : {}), ...envelope() },
});

// --- Input validation ------------------------------------------------------
// A public API validates rather than trusts. Every rejection names the field,
// because the alternative is a partner guessing against a 400.

const GOALS = ["general-fitness", "endurance-performance", "race-preparation", "weight-loss", "recovery-focus"];
const ACTIVITIES = ["running", "cycling", "triathlon", "trail-running", "swimming"];
const INTENSITIES = ["easy", "moderate", "hard", "race"];
const CONDITIONS = ["cool", "temperate", "hot"];
const SWEAT = ["light", "average", "heavy"];

const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

/** Validate the athlete/session input every endpoint starts from. */
export function parseAthleteInput(body: unknown): { input: AthleteInput } | { error: string } {
  if (!body || typeof body !== "object") return { error: "body must be a JSON object" };
  const b = body as Record<string, unknown>;

  if (!isNum(b.bodyWeightKg) || b.bodyWeightKg < 30 || b.bodyWeightKg > 200) {
    return { error: "bodyWeightKg must be a number between 30 and 200" };
  }
  if (!isNum(b.durationMin) || b.durationMin < 1 || b.durationMin > 2880) {
    return { error: "durationMin must be a number between 1 and 2880" };
  }
  if (typeof b.activity !== "string" || !ACTIVITIES.includes(b.activity)) {
    return { error: `activity must be one of ${ACTIVITIES.join(", ")}` };
  }
  if (typeof b.intensity !== "string" || !INTENSITIES.includes(b.intensity)) {
    return { error: `intensity must be one of ${INTENSITIES.join(", ")}` };
  }
  const goal = typeof b.goal === "string" && GOALS.includes(b.goal) ? b.goal : "endurance-performance";
  if (b.conditions !== undefined && (typeof b.conditions !== "string" || !CONDITIONS.includes(b.conditions))) {
    return { error: `conditions must be one of ${CONDITIONS.join(", ")}` };
  }
  if (b.sweatLevel !== undefined && (typeof b.sweatLevel !== "string" || !SWEAT.includes(b.sweatLevel))) {
    return { error: `sweatLevel must be one of ${SWEAT.join(", ")}` };
  }

  const physiology: AthleteInput["physiology"] = {};
  const p = (b.physiology ?? {}) as Record<string, unknown>;
  if (isNum(p.sweatRateMlPerH)) physiology.sweatRateMlPerH = p.sweatRateMlPerH;
  if (isNum(p.sweatSodiumMgPerL)) physiology.sweatSodiumMgPerL = p.sweatSodiumMgPerL;
  if (isNum(p.readiness)) physiology.readiness = p.readiness;

  return {
    input: {
      goal: goal as AthleteInput["goal"],
      activity: b.activity as AthleteInput["activity"],
      intensity: b.intensity as Intensity,
      durationMin: Math.round(b.durationMin),
      bodyWeightKg: b.bodyWeightKg,
      ...(b.conditions ? { conditions: b.conditions as AthleteInput["conditions"] } : {}),
      ...(b.sweatLevel ? { sweatLevel: b.sweatLevel as AthleteInput["sweatLevel"] } : {}),
      ...(typeof b.caffeineOk === "boolean" ? { caffeineOk: b.caffeineOk } : {}),
      ...(Object.keys(physiology).length > 0 ? { physiology } : {}),
    },
  };
}

/** A product, flattened to the fields a partner's UI actually renders. */
const publicProduct = (p: Product) => ({
  id: p.id,
  name: p.name,
  brand: p.brand,
  category: p.category,
  carbsG: p.carbsG,
  sodiumMg: p.sodiumMg,
  caffeineMg: p.caffeineMg ?? 0,
  servingLabel: p.servingLabel,
  multiTransportable: Boolean(p.multiTransportable),
});

// --- Endpoints -------------------------------------------------------------

/**
 * `POST /v1/plan` — the core call.
 *
 * Session in, complete fuelling plan out: hourly targets, the cue schedule a
 * watch counts down to, the products that deliver it, and whether the gut can
 * absorb the rate at all.
 */
export function v1Plan(body: unknown, catalog: Product[] = CATALOG): PublicResult {
  const parsed = parseAthleteInput(body);
  if ("error" in parsed) return fail(400, "invalid_request", parsed.error);
  const { input } = parsed;

  const rec = recommend(input, catalog);
  const schedule = buildSchedule(input);

  return {
    status: 200,
    data: {
      ...envelope(),
      target: {
        carbPerHourG: rec.target.carbPerHourG,
        carbTotalG: rec.target.carbTotalG,
        fluidPerHourMl: rec.target.fluidPerHourMl,
        sodiumPerLitreMg: rec.target.sodiumPerLitreMg,
        requiresMultiTransportable: rec.target.requiresMultiTransportable,
        // A partner has to be able to say "measured" vs "estimated" in their own
        // UI. Hiding provenance would let our estimate be shown as their fact.
        hydrationSource: rec.target.hydrationSource,
        sodiumSource: rec.target.sodiumSource,
      },
      // The watch payload: a flat, ordered list of "at this minute, do this".
      cues: schedule.cues.map((c) => ({
        atMin: c.atMin,
        kind: c.kind,
        label: c.label,
        carbG: c.carbG ?? 0,
        fluidMl: c.fluidMl ?? 0,
        sodiumMg: c.sodiumMg ?? 0,
        caffeine: Boolean(c.caffeine),
      })),
      phases: rec.phases.map((p) => ({
        phase: p.phase,
        headline: p.headline,
        detail: p.detail,
        products: p.products.map(publicProduct),
      })),
      deliverability: rec.deliverability
        ? {
            deliverable: rec.deliverability.deliverable,
            targetG: rec.deliverability.targetG,
            ceilingG: rec.deliverability.ceilingG,
            shortfallG: rec.deliverability.shortfallG,
            reason: rec.deliverability.ceiling.reason,
            fix: rec.deliverability.fix ?? null,
          }
        : null,
      notes: rec.notes,
    },
  };
}

/** Validate an elevation profile: `[{ distanceM, altM }]`, ascending by distance. */
function parseSamples(raw: unknown): { samples: ElevationSample[] } | { error: string } {
  if (!Array.isArray(raw) || raw.length < 2) return { error: "route must be an array of at least 2 points" };
  if (raw.length > 5000) return { error: "route may contain at most 5000 points" };
  const samples: ElevationSample[] = [];
  for (const [i, r] of raw.entries()) {
    const p = r as Record<string, unknown>;
    if (!isNum(p.distanceM) || !isNum(p.altM)) return { error: `route[${i}] needs numeric distanceM and altM` };
    if (i > 0 && p.distanceM < samples[i - 1].distanceM) return { error: `route[${i}].distanceM must not go backwards` };
    samples.push({ distanceM: p.distanceM, altM: p.altM });
  }
  return { samples };
}

/**
 * `POST /v1/course` — the same session against a real course.
 *
 * Where the feeds go on this height profile, and where the tank runs down with
 * the plan and without it. This is the call a watch makes once, before the
 * start, and then counts down against.
 */
export function v1Course(body: unknown, catalog: Product[] = CATALOG): PublicResult {
  if (!body || typeof body !== "object") return fail(400, "invalid_request", "body must be a JSON object");
  const b = body as Record<string, unknown>;

  const parsed = parseAthleteInput(b.session);
  if ("error" in parsed) return fail(400, "invalid_request", `session: ${parsed.error}`);
  const route = parseSamples(b.route);
  if ("error" in route) return fail(400, "invalid_request", route.error);

  const { input } = parsed;
  const target = computeTarget(input);
  const plan = planRouteFuelling({
    samples: route.samples,
    activity: input.activity,
    durationMin: input.durationMin,
    carbPerHourG: target.carbPerHourG,
    input,
    target,
    // Threaded through so a tenant with their own product library gets stops
    // that name *their* products, not ours.
    catalog,
  });

  const weather = (b.weather ?? {}) as Record<string, unknown>;
  const temperatureC = isNum(weather.temperatureC) ? weather.temperatureC : 18;
  const humidityPct = isNum(weather.humidityPct) ? weather.humidityPct : 50;

  const sim = simulateRace({
    plan,
    bodyWeightKg: input.bodyWeightKg,
    intensity: input.intensity,
    fluidPerHourMl: target.fluidPerHourMl,
    sodiumPerLitreMg: target.sodiumPerLitreMg,
    temperatureC,
    humidityPct,
    ...(input.sweatLevel ? { sweatLevel: input.sweatLevel } : {}),
    ...(input.physiology?.sweatRateMlPerH !== undefined
      ? { measuredSweatRateMlPerH: input.physiology.sweatRateMlPerH }
      : {}),
    ...(input.physiology?.sweatSodiumMgPerL !== undefined
      ? { measuredSweatSodiumMgPerL: input.physiology.sweatSodiumMgPerL }
      : {}),
  });

  return {
    status: 200,
    data: {
      ...envelope(),
      route: {
        distanceKm: plan.segments[plan.segments.length - 1]?.toKm ?? 0,
        // Summed from the drawn profile rather than only the climbs worth a
        // feed, which would report 0 m on a route that plainly goes up and down.
        ascentM: plan.segments.reduce(
          (sum, seg, i) => sum + Math.max(0, i === 0 ? 0 : seg.altM - plan.segments[i - 1].altM),
          0,
        ),
        estimatedMin: plan.estimatedMin,
        totalCarbG: plan.totalCarbG,
        climbs: plan.climbs.map((c) => ({
          fromKm: c.fromKm,
          toKm: c.toKm,
          gainM: c.gainM,
          avgGradePct: c.avgGradePct,
          startMin: c.startMin,
        })),
        notes: plan.notes,
      },
      stops: plan.stops.map((s) => ({
        atKm: s.atKm,
        atMin: s.atMin,
        altM: s.altM,
        carbG: s.carbG,
        kind: s.kind,
        reason: s.reason,
        // The stop carries a slim reference by design; the full product is one
        // /v1/catalog lookup away by id, and a partner usually has it cached.
        product: s.product
          ? { id: s.product.id, brand: s.product.brand, name: s.product.name, servingLabel: s.product.servingLabel }
          : null,
      })),
      forecast: {
        verdict: sim.verdict,
        storeG: sim.storeG,
        burnTotalG: sim.burnTotalG,
        intakeTotalG: sim.intakeTotalG,
        sweatTotalMl: sim.sweatTotalMl,
        sodiumLossTotalMg: sim.sodiumLossTotalMg,
        bonkKmUnfuelled: sim.bonkKmUnfuelled ?? null,
        bonkKmFuelled: sim.bonkKmFuelled ?? null,
        finishFuelledPct: sim.finishFuelledPct,
        finishUnfuelledPct: sim.finishUnfuelledPct,
        peakFluidDeficitPct: sim.peakFluidDeficitPct,
        feelsLikeC: sim.feelsLikeC,
        heatRisk: sim.heatRisk,
        // Both forms: the id and its numbers for a partner writing their own
        // copy, and our English for one that would rather not.
        warnings: sim.warnings.map((w) => ({
          id: w.id,
          severity: w.severity,
          atKm: w.atKm ?? null,
          values: w.values,
          text: w.text,
        })),
      },
      points: sim.points.map((p) => ({
        km: p.km,
        atMin: p.atMin,
        altM: p.altM,
        fuelledPct: p.fuelledPct,
        unfuelledPct: p.unfuelledPct,
        fluidDeficitPct: p.fluidDeficitPct,
      })),
    },
  };
}

/**
 * `POST /v1/absorption` — can this mix actually deliver this rate?
 *
 * Small, but the single most useful call for a partner who already has their own
 * products: it answers whether a plan is physiologically possible before their
 * athlete finds out it was not.
 */
export function v1Absorption(body: unknown, catalog: Product[] = CATALOG): PublicResult {
  if (!body || typeof body !== "object") return fail(400, "invalid_request", "body must be a JSON object");
  const b = body as Record<string, unknown>;
  if (!isNum(b.targetPerHourG) || b.targetPerHourG < 0 || b.targetPerHourG > 300) {
    return fail(400, "invalid_request", "targetPerHourG must be a number between 0 and 300");
  }

  // Either a product mix by id and servings, or raw grams of each sugar.
  let sources = { glucoseG: 0, fructoseG: 0 };
  if (Array.isArray(b.items)) {
    const parts = [];
    for (const [i, raw] of (b.items as unknown[]).entries()) {
      const it = raw as Record<string, unknown>;
      const product = catalog.find((p) => p.id === it.productId);
      if (!product) return fail(400, "invalid_request", `items[${i}].productId is not in the catalog`);
      const servings = isNum(it.servings) ? it.servings : 1;
      parts.push(productCarbSources(product, servings));
    }
    sources = sumCarbSources(parts);
  } else if (isNum(b.glucoseG) || isNum(b.fructoseG)) {
    sources = { glucoseG: isNum(b.glucoseG) ? b.glucoseG : 0, fructoseG: isNum(b.fructoseG) ? b.fructoseG : 0 };
  } else {
    return fail(400, "invalid_request", "provide either items[] or glucoseG/fructoseG");
  }

  const gutTrainedTo = isNum(b.gutTrainedToG) ? b.gutTrainedToG : undefined;
  const ceiling = absorptionCeiling(sources, gutTrainedTo);
  const check = checkDeliverable(b.targetPerHourG, sources, gutTrainedTo);

  return {
    status: 200,
    data: {
      ...envelope(),
      sources,
      ceiling: {
        ceilingG: ceiling.ceilingG,
        ratio: ceiling.ratio ?? null,
        multiTransportable: ceiling.multiTransportable,
        reason: ceiling.reason,
      },
      check: {
        deliverable: check.deliverable,
        targetG: check.targetG,
        ceilingG: check.ceilingG,
        shortfallG: check.shortfallG,
        fix: check.fix ?? null,
      },
    },
  };
}

/**
 * `POST /v1/heat` — what today's weather does to sweat, sodium and glycogen.
 *
 * The one call a watch can make repeatedly during a race, because conditions are
 * the input that actually changes while the athlete is out there.
 */
export function v1Heat(body: unknown): PublicResult {
  if (!body || typeof body !== "object") return fail(400, "invalid_request", "body must be a JSON object");
  const b = body as Record<string, unknown>;
  if (!isNum(b.bodyWeightKg) || b.bodyWeightKg < 30 || b.bodyWeightKg > 200) {
    return fail(400, "invalid_request", "bodyWeightKg must be a number between 30 and 200");
  }
  if (typeof b.intensity !== "string" || !INTENSITIES.includes(b.intensity)) {
    return fail(400, "invalid_request", `intensity must be one of ${INTENSITIES.join(", ")}`);
  }
  if (!isNum(b.temperatureC) || b.temperatureC < -40 || b.temperatureC > 60) {
    return fail(400, "invalid_request", "temperatureC must be a number between -40 and 60");
  }
  if (!isNum(b.humidityPct) || b.humidityPct < 0 || b.humidityPct > 100) {
    return fail(400, "invalid_request", "humidityPct must be a number between 0 and 100");
  }

  const strain = heatStrain({
    bodyWeightKg: b.bodyWeightKg,
    intensity: b.intensity as Intensity,
    temperatureC: b.temperatureC,
    humidityPct: b.humidityPct,
    ...(typeof b.sweatLevel === "string" && SWEAT.includes(b.sweatLevel)
      ? { sweatLevel: b.sweatLevel as "light" | "average" | "heavy" }
      : {}),
    ...(isNum(b.measuredSweatRateMlPerH) ? { measuredSweatRateMlPerH: b.measuredSweatRateMlPerH } : {}),
    ...(isNum(b.measuredSweatSodiumMgPerL) ? { measuredSweatSodiumMgPerL: b.measuredSweatSodiumMgPerL } : {}),
  });

  return {
    status: 200,
    data: {
      ...envelope(),
      feelsLikeC: strain.feelsLikeC,
      risk: strain.risk,
      sweatRateMlPerH: strain.sweatRateMlPerH,
      sodiumLossMgPerH: strain.sodiumLossMgPerH,
      sweatSodiumMgPerL: strain.sweatSodiumMgPerL,
      carbBurnMultiplier: strain.carbBurnMultiplier,
      carbBurnPerHourG: Math.round(carbBurnPerHourG(b.bodyWeightKg, b.intensity as Intensity) * strain.carbBurnMultiplier),
      measured: strain.measured,
      advice: strain.advice,
    },
  };
}

/** `GET /v1/meta` — what a partner needs to know before writing any code. */
export function v1Meta(scopes: string[], rateLimitPerMin: number): PublicResult {
  return {
    status: 200,
    data: {
      ...envelope(),
      scopes,
      rateLimitPerMin,
      endpoints: [
        { method: "GET", path: "/v1/meta", scope: null, summary: "This document." },
        { method: "POST", path: "/v1/plan", scope: "plan", summary: "Session in, full fuelling plan and cue schedule out." },
        { method: "POST", path: "/v1/course", scope: "course", summary: "A height profile in, feed placement and a bonk forecast out." },
        { method: "POST", path: "/v1/absorption", scope: "plan", summary: "Can this product mix deliver this carbohydrate rate?" },
        { method: "POST", path: "/v1/heat", scope: "plan", summary: "Sweat, sodium and glycogen cost of the current conditions." },
        { method: "GET", path: "/v1/catalog", scope: "catalog", summary: "The Swiss product library the plans are built from." },
        { method: "GET", path: "/v1/events", scope: "catalog", summary: "Curated Swiss races, with approximate dates flagged as such." },
        {
          method: "POST",
          path: "/v1/events/{id}/plan",
          scope: "plan",
          summary: "A named race, an athlete, and the race-day forecast — countdown, targets and carry legs out.",
        },
      ],
      documentation: "docs/public-api.md",
    },
  };
}

/** `GET /v1/catalog` — the product library, for a partner rendering our picks. */
export function v1Catalog(catalog: Product[] = CATALOG): PublicResult {
  return { status: 200, data: { ...envelope(), count: catalog.length, products: catalog.map(publicProduct) } };
}

/**
 * `GET /v1/events` — the curated races.
 *
 * `dateApproximate` is part of the contract rather than a note in the docs,
 * because a partner rendering "Jungfrau-Marathon · 12 September" without it is
 * publishing our guess as their fact. A field they have to destructure past is
 * the only version of that warning that survives an integration.
 */
export function v1Events(now = new Date()): PublicResult {
  return {
    status: 200,
    data: {
      ...envelope(),
      count: SWISS_EVENTS.length,
      events: SWISS_EVENTS.map((e) => ({
        id: e.id,
        name: e.name,
        discipline: e.discipline,
        distanceKm: e.distanceKm,
        ascentM: e.ascentM,
        maxAltM: e.maxAltM ?? null,
        date: e.date,
        dateApproximate: e.dateApproximate === true,
        daysOut: eventCountdown(e, now).daysOut,
        cutoffMin: e.cutoffMin ?? null,
        organiserUrl: e.organiserUrl ?? null,
        aidStationsKnown: (e.aidStations?.length ?? 0) > 0,
      })),
    },
  };
}

/**
 * `POST /v1/events/{id}/plan` — a named race, fuelled for the day it falls on.
 *
 * The one endpoint here that reaches the network: race-day weather is fetched
 * when the date is inside model range. It never fails for that reason — an
 * unreachable model returns `weather.forecast: false` and a seasonal figure, so
 * a watch on a train still gets a plan.
 */
export async function v1EventPlan(id: string, body: unknown, now = new Date()): Promise<PublicResult> {
  const event = eventById(id);
  if (!event) return fail(404, "unknown_event", `No curated event with id \`${id}\`. List them at GET /v1/events.`);
  if (!body || typeof body !== "object") return fail(400, "invalid_request", "body must be a JSON object");
  const b = body as Record<string, unknown>;

  if (!isNum(b.bodyWeightKg) || b.bodyWeightKg < 30 || b.bodyWeightKg > 200) {
    return fail(400, "invalid_request", "bodyWeightKg must be a number between 30 and 200");
  }
  if (b.estimatedMin !== undefined && (!isNum(b.estimatedMin) || b.estimatedMin < 20 || b.estimatedMin > 2880)) {
    return fail(400, "invalid_request", "estimatedMin must be a number between 20 and 2880");
  }
  if (b.startHour !== undefined && (!isNum(b.startHour) || b.startHour < 0 || b.startHour > 23)) {
    return fail(400, "invalid_request", "startHour must be a number between 0 and 23");
  }
  if (b.sweatLevel !== undefined && (typeof b.sweatLevel !== "string" || !SWEAT.includes(b.sweatLevel))) {
    return fail(400, "invalid_request", `sweatLevel must be one of ${SWEAT.join(", ")}`);
  }

  const plan = await planEvent({
    event,
    bodyWeightKg: b.bodyWeightKg,
    ...(isNum(b.estimatedMin) ? { estimatedMin: Math.round(b.estimatedMin) } : {}),
    ...(isNum(b.flatPaceMinPerKm) ? { flatPaceMinPerKm: b.flatPaceMinPerKm } : {}),
    ...(isNum(b.startHour) ? { startHour: Math.round(b.startHour) } : {}),
    ...(typeof b.sweatLevel === "string" ? { sweatLevel: b.sweatLevel as AthleteInput["sweatLevel"] } : {}),
    now,
  });

  return {
    status: 200,
    data: {
      ...envelope(),
      event: { id: event.id, name: event.name, date: event.date, dateApproximate: event.dateApproximate === true },
      countdown: {
        daysOut: plan.countdown.daysOut,
        weeksOut: plan.countdown.weeksOut,
        phase: plan.countdown.phase,
      },
      estimatedMin: plan.estimatedMin,
      estimateSource: plan.estimateSource,
      target: {
        carbPerHourG: plan.target.carbPerHourG,
        carbTotalG: plan.target.carbTotalG,
        fluidPerHourMl: plan.target.fluidPerHourMl,
        sodiumPerLitreMg: plan.target.sodiumPerLitreMg,
        requiresMultiTransportable: plan.target.requiresMultiTransportable,
      },
      weather: {
        temperatureC: plan.weather.temperatureC,
        peakTemperatureC: plan.weather.peakTemperatureC,
        humidityPct: plan.weather.humidityPct,
        windKmh: plan.weather.windKmh,
        conditions: plan.weather.conditions,
        // The field a partner must branch on before showing a number as a
        // forecast. Everything else here is identical whichever it is.
        forecast: plan.weather.forecast,
        // Why there is no forecast, when there is none: "the race is in June"
        // and "we could not reach the model" call for different words in a
        // partner's UI, and only one of them is worth retrying.
        estimateReason: plan.weather.estimateReason ?? null,
        source: plan.weather.source,
        sourceLabel: plan.weather.sourceLabel,
        windowFromHour: plan.weather.window[0],
        windowToHour: plan.weather.window[1],
      },
      // Ids and numbers, never sentences: the partner's own UI writes the copy,
      // in their language, in their voice.
      advice: plan.advice.map((a) => ({ id: a.id, severity: a.severity, values: a.values })),
      legs: plan.legs,
      aidStationsKnown: plan.legs.length > 0,
    },
  };
}
