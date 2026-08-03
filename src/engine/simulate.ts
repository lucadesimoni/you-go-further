import { heatStrain, type HeatInput, type HeatRisk } from "./heatStrain";
import { carbBurnPerHourG } from "./oxidation";
import type { RouteFuelPlan } from "./routeFuelling";
import type { Intensity } from "./types";

/**
 * Race simulation — the tank, kilometre by kilometre, on *this* course.
 *
 * A watch gives you a drink reminder every 20 minutes and a generic "low
 * stamina" warning. Neither knows that the climb at km 28 costs 2.5× the flat
 * per metre, that the aid station before it is the last chance to eat, or that
 * 31 °C at 80 % humidity has already moved the fade forward by half an hour.
 *
 * This walks the actual route segment by segment and tracks four balances:
 *
 * - **Carbohydrate**: burn from grade-adjusted energy cost, intake from the
 *   planned stops, against the athlete's own glycogen store.
 * - **Fluid**: sweat from the modelled heat strain, drink from the plan,
 *   expressed as the deficit in percent of body mass — 2 % is where endurance
 *   performance measurably drops.
 * - **Sodium**: loss against replacement, because cramping and hyponatraemia
 *   both live here.
 * - **Time**: so every warning can name a kilometre and a clock reading.
 *
 * It then reports the same course **without** the plan. That contrast is the
 * product: not "drink now", but "you fade at km 31 on water, and finish with
 * 21 % in the tank if you take these four feeds".
 *
 * It is a transparent model built on published population physiology, not a
 * measurement of this athlete's metabolism, and every surface that shows it
 * says so.
 */

export interface SimPoint {
  km: number;
  atMin: number;
  altM: number;
  /** Glycogen remaining with the plan, as % of the usable store. */
  fuelledPct: number;
  /** Glycogen remaining on water alone. */
  unfuelledPct: number;
  /** Fluid deficit with the plan, as % of body mass (positive = down on fluid). */
  fluidDeficitPct: number;
  /** Cumulative carbohydrate taken so far, grams. */
  takenG: number;
  /** Cumulative carbohydrate burned so far, grams. */
  burnedG: number;
}

export interface SimWarning {
  id: "bonk" | "bonkAverted" | "dehydration" | "sodium" | "lateStart" | "gapBeforeClimb";
  severity: "info" | "watch" | "act";
  /** Where it bites, in km — so the athlete can find it on the course. */
  atKm?: number;
  /**
   * The numbers behind the sentence, so a UI can write its own in its own
   * language rather than parsing them back out of `text`.
   */
  values: Record<string, number>;
  /** English fallback for consumers without a dictionary (API, logs, tests). */
  text: string;
}

/** Which sentence describes the outcome — the UI translates it, `headline` is English. */
export type SimVerdict = "outrun" | "averted" | "covered";

export interface RaceSimulation {
  points: SimPoint[];
  /** Usable glycogen at the start, grams. */
  storeG: number;
  /** Total carbohydrate the course demands, grams. */
  burnTotalG: number;
  /** Total the plan delivers, grams. */
  intakeTotalG: number;
  /** Total sweat loss, millilitres. */
  sweatTotalMl: number;
  /** Total sodium loss, milligrams. */
  sodiumLossTotalMg: number;
  /** Kilometre where the tank crosses the fade line without fuelling. */
  bonkKmUnfuelled?: number;
  /** Kilometre where it crosses *with* the plan — undefined when it never does. */
  bonkKmFuelled?: number;
  /** Tank at the finish, each scenario, as % of the store. */
  finishFuelledPct: number;
  finishUnfuelledPct: number;
  /** Worst fluid deficit reached, % of body mass. */
  peakFluidDeficitPct: number;
  /** What the conditions feel like once humidity is counted, °C. */
  feelsLikeC: number;
  heatRisk: HeatRisk;
  warnings: SimWarning[];
  /** Which of the three outcomes this is, for a UI that writes its own sentence. */
  verdict: SimVerdict;
  /** One sentence an athlete can repeat to themselves on the start line (English). */
  headline: string;
}

export interface SimInput {
  plan: RouteFuelPlan;
  bodyWeightKg: number;
  intensity: Intensity;
  /** Fluid the athlete plans to drink per hour, millilitres. */
  fluidPerHourMl: number;
  /** Sodium in that fluid, mg per litre. */
  sodiumPerLitreMg: number;
  temperatureC: number;
  humidityPct: number;
  sweatLevel?: HeatInput["sweatLevel"];
  measuredSweatRateMlPerH?: number;
  measuredSweatSodiumMgPerL?: number;
  /** Glycogen store, g/kg. Endurance-trained muscle + liver ≈ 6.5. */
  glycogenPerKg?: number;
}

/** Below this share of the store, pace falls away sharply — the fade line. */
export const FADE_PCT = 20;

/** Fluid deficit at which endurance performance measurably drops, % body mass. */
export const DEHYDRATION_PCT = 2;

const round1 = (n: number) => Math.round(n * 10) / 10;

/**
 * Walk the course and track every balance.
 *
 * Burn is distributed by each segment's **share of the route's energy cost**,
 * which already carries the grade-adjusted cost of running or riding it — so a
 * climb drains the tank faster than the flat, exactly as it does in the legs.
 */
export function simulateRace(input: SimInput): RaceSimulation {
  const { plan, bodyWeightKg, intensity } = input;
  const segments = plan.segments;
  const storeG = Math.round(bodyWeightKg * (input.glycogenPerKg ?? 6.5));

  const heat = heatStrain({
    bodyWeightKg,
    intensity,
    temperatureC: input.temperatureC,
    humidityPct: input.humidityPct,
    ...(input.sweatLevel ? { sweatLevel: input.sweatLevel } : {}),
    ...(input.measuredSweatRateMlPerH !== undefined
      ? { measuredSweatRateMlPerH: input.measuredSweatRateMlPerH }
      : {}),
    ...(input.measuredSweatSodiumMgPerL !== undefined
      ? { measuredSweatSodiumMgPerL: input.measuredSweatSodiumMgPerL }
      : {}),
  });

  // The plan's own total, not the last segment's *start* — reading the timeline
  // off `atMin` alone loses the whole final segment, which on a point-to-point
  // course is the descent to the finish.
  const totalMin = plan.estimatedMin > 0 ? plan.estimatedMin : (segments[segments.length - 1]?.atMin ?? 0);
  const hours = totalMin / 60;
  // Heat raises glycogen use at the same power — a hot race empties sooner.
  const burnPerHourG = carbBurnPerHourG(bodyWeightKg, intensity) * heat.carbBurnMultiplier;
  const burnTotalG = Math.round(burnPerHourG * hours);
  const sweatTotalMl = Math.round(heat.sweatRateMlPerH * hours);
  const sodiumLossTotalMg = Math.round(heat.sodiumLossMgPerH * hours);

  const points: SimPoint[] = [];
  let burned = 0;
  let taken = 0;
  let fluidIn = 0;
  let sweatOut = 0;
  let bonkKmUnfuelled: number | undefined;
  let bonkKmFuelled: number | undefined;
  let peakFluidDeficitPct = 0;

  const stops = [...plan.stops].sort((a, b) => a.atKm - b.atKm);
  let nextStop = 0;

  for (const [i, seg] of segments.entries()) {
    // Burn for this segment, from its share of the whole route's energy cost.
    burned += burnTotalG * seg.costShare;
    // Elapsed time is the gap to the next segment's start, and the remainder of
    // the race for the last one — so the finishing point reads the finish time.
    const endMin = segments[i + 1]?.atMin ?? totalMin;
    const segHours = Math.max(0, endMin - seg.atMin) / 60;

    sweatOut += heat.sweatRateMlPerH * segHours;
    fluidIn += input.fluidPerHourMl * segHours;

    // Anything the plan says to take at or before this point is now in.
    while (nextStop < stops.length && stops[nextStop].atKm <= seg.toKm) {
      taken += stops[nextStop].carbG;
      nextStop++;
    }

    // The tank cannot hold more than it started with: carbohydrate taken beyond
    // what has been burned is not banked, it is simply not needed yet.
    const fuelledPct = Math.max(0, Math.min(100, ((storeG - burned + Math.min(taken, burned)) / storeG) * 100));
    const unfuelledPct = Math.max(0, ((storeG - burned) / storeG) * 100);
    const fluidDeficitPct = Math.max(0, ((sweatOut - fluidIn) / (bodyWeightKg * 1000)) * 100);
    peakFluidDeficitPct = Math.max(peakFluidDeficitPct, fluidDeficitPct);

    // Whole kilometres. A tenth of a kilometre implies a precision this model
    // does not have — the segment it falls in is already coarser than that.
    if (bonkKmUnfuelled === undefined && unfuelledPct <= FADE_PCT) bonkKmUnfuelled = Math.max(1, Math.round(seg.toKm));
    if (bonkKmFuelled === undefined && fuelledPct <= FADE_PCT) bonkKmFuelled = Math.max(1, Math.round(seg.toKm));

    points.push({
      km: seg.toKm,
      atMin: Math.round(endMin),
      altM: seg.altM,
      fuelledPct: round1(fuelledPct),
      unfuelledPct: round1(unfuelledPct),
      fluidDeficitPct: round1(fluidDeficitPct),
      takenG: Math.round(taken),
      burnedG: Math.round(burned),
    });
  }

  const last = points[points.length - 1];
  const finishFuelledPct = last ? last.fuelledPct : 100;
  const finishUnfuelledPct = last ? last.unfuelledPct : 100;

  const warnings: SimWarning[] = [];

  if (bonkKmUnfuelled !== undefined && bonkKmFuelled === undefined) {
    warnings.push({
      id: "bonkAverted",
      severity: "info",
      atKm: bonkKmUnfuelled,
      values: { km: bonkKmUnfuelled, finishPct: Math.round(finishFuelledPct) },
      text: `On water alone you would be running on empty by km ${bonkKmUnfuelled}. With this plan you finish with about ${Math.round(finishFuelledPct)}% still in the tank.`,
    });
  }
  if (bonkKmFuelled !== undefined) {
    warnings.push({
      id: "bonk",
      severity: "act",
      atKm: bonkKmFuelled,
      values: { km: bonkKmFuelled },
      text: `Even with the plan the tank runs down around km ${bonkKmFuelled}. Take more before that point, or accept a slower second half.`,
    });
  }
  if (peakFluidDeficitPct >= DEHYDRATION_PCT) {
    warnings.push({
      id: "dehydration",
      severity: peakFluidDeficitPct >= 3 ? "act" : "watch",
      values: {
        deficitPct: round1(peakFluidDeficitPct),
        threshold: DEHYDRATION_PCT,
        mlPerHour: Math.round(heat.sweatRateMlPerH),
      },
      text: `Fluid runs about ${round1(peakFluidDeficitPct)}% of body mass down — past ${DEHYDRATION_PCT}% pace starts to suffer. Drink ${Math.round(heat.sweatRateMlPerH)} ml an hour rather than to thirst.`,
    });
  }
  const sodiumIn = (fluidIn / 1000) * input.sodiumPerLitreMg;
  if (sodiumLossTotalMg > 0 && sodiumIn < sodiumLossTotalMg * 0.5 && sodiumLossTotalMg > 1500) {
    warnings.push({
      id: "sodium",
      severity: "watch",
      values: { lossMg: sodiumLossTotalMg, replacedMg: Math.round(sodiumIn) },
      text: `You lose about ${sodiumLossTotalMg} mg of sodium and replace roughly ${Math.round(sodiumIn)} mg. Over a session this long that gap is where cramping starts.`,
    });
  }
  const first = stops[0];
  if (first && first.atMin > 45) {
    warnings.push({
      id: "lateStart",
      severity: "watch",
      atKm: first.atKm,
      values: { atMin: Math.round(first.atMin) },
      text: `The first feed is at ${Math.round(first.atMin)} minutes. Starting inside the first 30–40 keeps the tank topped rather than chasing it later.`,
    });
  }

  const verdict: SimVerdict =
    bonkKmFuelled !== undefined ? "outrun" : bonkKmUnfuelled !== undefined ? "averted" : "covered";
  const headline =
    verdict === "outrun"
      ? `This course outruns the plan around km ${bonkKmFuelled}.`
      : verdict === "averted"
        ? `Empty by km ${bonkKmUnfuelled} on water — about ${Math.round(finishFuelledPct)}% left with the plan.`
        : `The plan covers this course: about ${Math.round(finishFuelledPct)}% in reserve at the finish.`;

  return {
    points,
    storeG,
    burnTotalG,
    intakeTotalG: Math.round(taken),
    sweatTotalMl,
    sodiumLossTotalMg,
    ...(bonkKmUnfuelled !== undefined ? { bonkKmUnfuelled } : {}),
    ...(bonkKmFuelled !== undefined ? { bonkKmFuelled } : {}),
    finishFuelledPct: round1(finishFuelledPct),
    finishUnfuelledPct: round1(finishUnfuelledPct),
    peakFluidDeficitPct: round1(peakFluidDeficitPct),
    feelsLikeC: heat.feelsLikeC,
    heatRisk: heat.risk,
    warnings,
    verdict,
    headline,
  };
}
