import type { ElevationSample } from "../geo/swisstopo";
import type { Activity, AthleteInput, FuelingTarget, Product } from "./types";
import { scoreForSlot } from "./offering";
import { CATALOG } from "./catalog";

/**
 * Fuelling placed by **where the energy is actually spent**, not by the clock.
 *
 * A stop every 40 minutes is the wrong advice on a Swiss route. Running a 10 %
 * climb costs about 1.7× the energy per metre of the same ground on the flat
 * (2.5× at 20 %), while a −20 % descent costs about half — so an even split
 * under-fuels the climbs and wastes carbohydrate on the way down. Worse, the
 * descent is where an athlete physically *can't* eat: hands on the brakes, high
 * cadence, jostled gut.
 *
 * So this module does three things:
 *
 *  1. Turns the elevation profile into a **cost curve** — energy per metre as a
 *     function of gradient.
 *  2. Converts distance to elapsed time through the same gradient (climbs are
 *     slow, descents fast), so a stop lands at the right *minute*.
 *  3. Places feeds where they're both needed and possible: shortly **before** a
 *     sustained climb, never deep in a steep descent, and never in the last few
 *     minutes where the carbohydrate can no longer be absorbed in time.
 *
 * The running cost model is Minetti et al. (2002), "Energy cost of walking and
 * running at extreme uphill and downhill slopes" (J Appl Physiol 93:1039–1046),
 * the standard polynomial behind every grade-adjusted-pace implementation.
 */

/** Minetti's energy cost of running, J/kg/m, for gradient `i` (rise/run). */
export function runningCostPerM(i: number): number {
  // The polynomial is fitted over −0.45 … +0.45; outside it, it diverges.
  const g = Math.max(-0.45, Math.min(0.45, i));
  return 155.4 * g ** 5 - 30.4 * g ** 4 - 43.3 * g ** 3 + 46.3 * g ** 2 + 19.5 * g + 3.6;
}

/**
 * Relative cost of riding a gradient, normalised so flat = 1.
 *
 * On a bike the dominant term against gravity is m·g·sin(θ) and the rider holds
 * roughly constant power, so cost per *metre travelled* rises steeply with
 * gradient while a descent approaches free-wheeling.
 */
export function cyclingCostPerM(i: number): number {
  const g = Math.max(-0.2, Math.min(0.2, i));
  // 1 on the flat; ~4× at 10 % up; floors near zero on a real descent.
  return Math.max(0.15, 1 + 30 * g);
}

/** Flat-ground reference cost, used to normalise the running model. */
const RUN_FLAT_COST = runningCostPerM(0);

export type RouteSportKind = "run" | "ride";

/** Which cost model an activity should use. */
export function sportKind(activity: Activity | undefined): RouteSportKind {
  return activity === "cycling" || activity === "triathlon" ? "ride" : "run";
}

/** Cost per metre relative to the flat, for the given sport and gradient. */
export function relativeCost(kind: RouteSportKind, gradient: number): number {
  return kind === "ride" ? cyclingCostPerM(gradient) : runningCostPerM(gradient) / RUN_FLAT_COST;
}

/**
 * Relative *speed* on a gradient, flat = 1. Climbs take longer per metre, which
 * is what puts a stop at the right minute rather than the right kilometre.
 */
export function relativeSpeed(kind: RouteSportKind, gradient: number): number {
  if (kind === "ride") {
    // Roughly inverse to the power demand, with a sane ceiling on descents.
    return Math.max(0.25, Math.min(2.2, 1 / Math.max(0.3, 1 + 22 * gradient)));
  }
  // Running: about 6 s/km slower per 1 % up, faster downhill until it plateaus.
  if (gradient >= 0) return Math.max(0.4, 1 - 5.5 * gradient);
  return Math.min(1.25, 1 - 2.2 * gradient);
}

export interface RouteSegment {
  fromKm: number;
  toKm: number;
  /** Gradient as a percentage, positive uphill. */
  gradePct: number;
  /** Share of the whole route's energy cost, 0–1. */
  costShare: number;
  /** Elapsed minutes at the segment's start. */
  atMin: number;
  altM: number;
}

export type StopKind = "climb-prep" | "steady" | "summit";

export interface RouteFuelStop {
  /** Minutes from the start. */
  atMin: number;
  atKm: number;
  altM: number;
  carbG: number;
  kind: StopKind;
  /** Plain reason this stop is here, shown to the athlete. */
  reason: string;
  /**
   * What to actually take here. Grams alone leave the athlete to do the
   * translation in their kitchen; naming the product is the difference between
   * advice and an instruction. Chosen by the same scorer the planner uses, so
   * the two can never recommend different things for one session.
   */
  product?: { id: string; brand: string; name: string; servingLabel: string };
}

export interface Climb {
  fromKm: number;
  toKm: number;
  gainM: number;
  avgGradePct: number;
  startMin: number;
}

export interface RouteFuelPlan {
  segments: RouteSegment[];
  climbs: Climb[];
  stops: RouteFuelStop[];
  totalCarbG: number;
  /** Duration implied by the profile, if no measured duration was given. */
  estimatedMin: number;
  notes: string[];
}

const round1 = (n: number) => Math.round(n * 10) / 10;

/**
 * Break the profile into segments carrying gradient, energy share and elapsed
 * time. `durationMin` anchors the timeline when it is known (a recorded session
 * or a planned length); otherwise the relative speeds set the shape and the
 * total is derived from a nominal flat pace.
 */
export function buildSegments(
  samples: ElevationSample[],
  kind: RouteSportKind,
  durationMin?: number,
): { segments: RouteSegment[]; totalMin: number } {
  if (samples.length < 2) return { segments: [], totalMin: durationMin ?? 0 };

  const raw = [];
  let totalCost = 0;
  let totalTimeUnits = 0;
  for (let i = 1; i < samples.length; i++) {
    const runM = samples[i].distanceM - samples[i - 1].distanceM;
    if (runM <= 0) continue;
    const riseM = samples[i].altM - samples[i - 1].altM;
    const gradient = riseM / runM;
    const cost = relativeCost(kind, gradient) * runM;
    // Time is distance ÷ speed; the units cancel when we normalise below.
    const timeUnits = runM / relativeSpeed(kind, gradient);
    totalCost += cost;
    totalTimeUnits += timeUnits;
    raw.push({
      fromM: samples[i - 1].distanceM,
      toM: samples[i].distanceM,
      gradient,
      cost,
      timeUnits,
      altM: samples[i - 1].altM,
    });
  }
  if (raw.length === 0) return { segments: [], totalMin: durationMin ?? 0 };

  // A route with no measured duration still needs a timeline: use a nominal
  // flat pace per sport so the shape (not the absolute total) is meaningful.
  const flatKmh = kind === "ride" ? 26 : 10.5;
  const totalKm = raw[raw.length - 1].toM / 1000;
  const totalMin = durationMin ?? Math.round((totalKm / flatKmh) * 60 * (totalTimeUnits / (totalKm * 1000 || 1)));

  const segments: RouteSegment[] = [];
  let elapsedUnits = 0;
  for (const r of raw) {
    segments.push({
      fromKm: round1(r.fromM / 1000),
      toKm: round1(r.toM / 1000),
      gradePct: Math.round(r.gradient * 1000) / 10,
      costShare: totalCost > 0 ? r.cost / totalCost : 0,
      atMin: Math.round((elapsedUnits / totalTimeUnits) * totalMin),
      altM: Math.round(r.altM),
    });
    elapsedUnits += r.timeUnits;
  }
  return { segments, totalMin };
}

/**
 * Sustained climbs worth fuelling for. Short ramps aren't worth a feed; a climb
 * qualifies on total gain, so a long shallow drag counts as well as a wall.
 */
export function findClimbs(segments: RouteSegment[], minGainM = 60): Climb[] {
  const climbs: Climb[] = [];
  let open: { fromKm: number; startMin: number; gain: number; altStart: number } | null = null;

  for (const s of segments) {
    const rise = ((s.toKm - s.fromKm) * 1000 * s.gradePct) / 100;
    if (s.gradePct >= 2) {
      if (!open) open = { fromKm: s.fromKm, startMin: s.atMin, gain: 0, altStart: s.altM };
      open.gain += rise;
    } else if (open) {
      // A brief dip inside a climb shouldn't split it; only a real descent or
      // flat run does.
      if (s.gradePct > -1.5) {
        open.gain += Math.max(0, rise);
        continue;
      }
      if (open.gain >= minGainM) {
        climbs.push({
          fromKm: open.fromKm,
          toKm: s.fromKm,
          gainM: Math.round(open.gain),
          avgGradePct:
            s.fromKm > open.fromKm ? Math.round((open.gain / ((s.fromKm - open.fromKm) * 1000)) * 1000) / 10 : 0,
          startMin: open.startMin,
        });
      }
      open = null;
    }
  }
  if (open && open.gain >= minGainM) {
    const last = segments[segments.length - 1];
    climbs.push({
      fromKm: open.fromKm,
      toKm: last.toKm,
      gainM: Math.round(open.gain),
      avgGradePct:
        last.toKm > open.fromKm ? Math.round((open.gain / ((last.toKm - open.fromKm) * 1000)) * 1000) / 10 : 0,
      startMin: open.startMin,
    });
  }
  return climbs;
}

/** The segment covering a given elapsed minute. */
function segmentAtMin(segments: RouteSegment[], min: number): RouteSegment | undefined {
  let found: RouteSegment | undefined;
  for (const s of segments) {
    if (s.atMin <= min) found = s;
    else break;
  }
  return found ?? segments[0];
}

export interface RouteFuelInput {
  samples: ElevationSample[];
  activity?: Activity;
  /** Known session length; otherwise derived from the profile. */
  durationMin?: number;
  /** The engine's carbohydrate target for this session. */
  carbPerHourG: number;
  /**
   * Session + target + catalog, so each stop can name a real product. Omit them
   * and the plan still works — it just gives grams.
   */
  input?: AthleteInput;
  target?: FuelingTarget;
  catalog?: Product[];
}

/**
 * The best product for a stop of this kind.
 *
 * A stop before a climb wants the fast carbohydrate of a gel or drink top-up;
 * the routine ones sit on the main carrier. Both go through `scoreForSlot`, so
 * the choice matches the planner's for the same session.
 */
function productForStop(
  kind: StopKind,
  input: AthleteInput,
  target: FuelingTarget,
  catalog: Product[],
): RouteFuelStop["product"] {
  const slot = kind === "climb-prep" ? "carb-topup" : "carb-carrier";
  const best = catalog
    .map((p) => scoreForSlot(p, slot, input, target))
    .filter((s): s is NonNullable<typeof s> => s !== null)
    .sort((a, b) => b.score - a.score)[0];
  if (!best) return undefined;
  const { id, brand, name, servingLabel } = best.product;
  return { id, brand, name, servingLabel };
}

/**
 * Build the fuelling plan for a route.
 *
 * Doses are sized from the athlete's carb-per-hour target and spaced by what a
 * gut tolerates (no closer than 15 minutes), then nudged onto the terrain:
 * pulled *earlier* so they land before a climb rather than during it, and pushed
 * off steep descents where eating is impractical.
 */
export function planRouteFuelling(input: RouteFuelInput): RouteFuelPlan {
  const { samples, activity, durationMin, carbPerHourG, target, catalog = CATALOG } = input;
  const sessionInput = input.input;
  const kind = sportKind(activity);
  const { segments, totalMin } = buildSegments(samples, kind, durationMin);
  const notes: string[] = [];

  if (segments.length === 0 || totalMin <= 0 || carbPerHourG <= 0) {
    return { segments, climbs: [], stops: [], totalCarbG: 0, estimatedMin: totalMin, notes };
  }

  const climbs = findClimbs(segments);
  const totalCarbG = Math.round((carbPerHourG * totalMin) / 60);

  // Under an hour there is nothing to schedule — the athlete starts topped up.
  if (totalMin < 45 || totalCarbG <= 0) {
    notes.push("Short enough to run on what you started with — no on-route feeds needed.");
    return { segments, climbs, stops: [], totalCarbG: 0, estimatedMin: totalMin, notes };
  }

  // Dose size: ~25 g is a gel or a bottle mouthful, and keeps feeds frequent
  // enough that a missed one doesn't matter.
  const doseG = carbPerHourG >= 75 ? 30 : 25;
  const count = Math.max(1, Math.round(totalCarbG / doseG));
  // Nothing in the last 10 minutes: it cannot be absorbed before the finish.
  const usableMin = Math.max(1, totalMin - 10);
  const spacing = usableMin / (count + 1);

  const stops: RouteFuelStop[] = [];
  const MIN_GAP = 15;

  for (let i = 1; i <= count; i++) {
    let at = Math.round(spacing * i);
    let kindOfStop: StopKind = "steady";
    let reason = "Steady top-up to keep carbohydrate arriving.";

    // If a climb starts soon after this slot, move the feed to just before it:
    // carbohydrate wants ~10 minutes' head start on the demand, and eating is
    // far easier on the approach than on the wall.
    const upcoming = climbs.find((c) => c.startMin >= at - 4 && c.startMin <= at + 20);
    if (upcoming) {
      at = Math.max(5, upcoming.startMin - 6);
      kindOfStop = "climb-prep";
      reason = `Before the ${upcoming.gainM} m climb at km ${upcoming.fromKm} — take it on the approach, not on the ramp.`;
    } else {
      // Otherwise avoid steep descents, where eating is impractical.
      const here = segmentAtMin(segments, at);
      if (here && here.gradePct <= -6) {
        const later = segments.find((s) => s.atMin > at && s.gradePct > -4);
        if (later) {
          at = later.atMin;
          reason = "Held until the descent eases — hard to eat safely at speed.";
        }
      }
    }

    // Keep the gut's spacing even after the terrain nudges.
    const prev = stops[stops.length - 1];
    if (prev && at - prev.atMin < MIN_GAP) at = prev.atMin + MIN_GAP;
    if (at >= usableMin) continue;

    const seg = segmentAtMin(segments, at);
    stops.push({
      atMin: at,
      atKm: seg?.fromKm ?? 0,
      altM: seg?.altM ?? 0,
      carbG: doseG,
      kind: kindOfStop,
      reason,
      product: sessionInput && target ? productForStop(kindOfStop, sessionInput, target, catalog) : undefined,
    });
  }

  // A summit on a long climb deserves its own note: the descent after it is a
  // long stretch with no realistic chance to eat.
  const bigClimb = climbs.find((c) => c.gainM >= 250);
  if (bigClimb) {
    notes.push(
      `${bigClimb.gainM} m of climbing from km ${bigClimb.fromKm} — the descent after it is the longest stretch where you won't be able to eat, so top up at the top.`,
    );
  }
  if (climbs.length === 0) {
    notes.push("Gentle profile — even spacing works here; eat to the clock.");
  }

  const delivered = stops.reduce((sum, s) => sum + s.carbG, 0);
  if (delivered < totalCarbG * 0.8) {
    notes.push(
      `Terrain limits you to about ${delivered} g on the move against a ${totalCarbG} g target — start topped up and take the rest right after.`,
    );
  }

  return { segments, climbs, stops, totalCarbG: delivered, estimatedMin: totalMin, notes };
}
