import type { Conditions, Intensity } from "./types";

/**
 * Heat strain — what the weather does to sweat, sodium and carbohydrate.
 *
 * A watch tells you to drink on a timer. The timer does not know it is 31 °C at
 * 80 % humidity, which is where the same session costs the athlete twice the
 * fluid and enough sodium to matter. This models the three things heat actually
 * changes:
 *
 * 1. **Sweat rate** rises with metabolic heat production (intensity × mass) and
 *    with the environment's inability to take that heat away. Humidity is the
 *    part most models drop, and it is the part that decides whether sweat
 *    evaporates — at 90 % humidity sweat runs off the skin without cooling
 *    anything, so the body simply produces more of it.
 * 2. **Carbohydrate oxidation** rises in the heat: muscle glycogen use is higher
 *    at the same power, so a hot race empties the tank sooner (Febbraio 2001;
 *    the effect is on the order of 10–25 %).
 * 3. **Sodium loss** scales with sweat rate, and the concentration itself varies
 *    fivefold between athletes — which is why a measured value always wins over
 *    this estimate.
 *
 * Everything is population physiology with explicit ranges, and every output
 * carries how it was derived so the UI can label an estimate as an estimate.
 */

export interface HeatInput {
  bodyWeightKg: number;
  intensity: Intensity;
  temperatureC: number;
  /** Relative humidity, 0–100. */
  humidityPct: number;
  /** Athlete's own sweat tendency, when they have told us. */
  sweatLevel?: "light" | "average" | "heavy";
  /** A measured sweat rate always wins over the model. */
  measuredSweatRateMlPerH?: number;
  /** A measured sweat sodium concentration always wins too. */
  measuredSweatSodiumMgPerL?: number;
}

export type HeatRisk = "low" | "moderate" | "high" | "extreme";

export interface HeatStrain {
  /** Fluid loss, millilitres per hour. */
  sweatRateMlPerH: number;
  /** Sodium leaving in that sweat, milligrams per hour. */
  sodiumLossMgPerH: number;
  /** Concentration used, mg per litre. */
  sweatSodiumMgPerL: number;
  /** Multiplier on carbohydrate burn from heat alone (1.0 = no effect). */
  carbBurnMultiplier: number;
  /**
   * Heat index in °C — what the temperature *feels* like once humidity is taken
   * into account, which is what the body responds to.
   */
  feelsLikeC: number;
  risk: HeatRisk;
  /** True when the sweat figure came from a measurement rather than the model. */
  measured: boolean;
  /** One line an athlete can act on. */
  advice: string;
}

/**
 * Apparent temperature from temperature and humidity.
 *
 * The Rothfusz regression behind the US National Weather Service heat index,
 * converted to Celsius. Below ~27 °C humidity barely changes what the body
 * feels, so the plain temperature is used there rather than extrapolating a
 * formula outside its range.
 */
export function heatIndexC(temperatureC: number, humidityPct: number): number {
  if (temperatureC < 27) return Math.round(temperatureC * 10) / 10;
  const T = (temperatureC * 9) / 5 + 32; // the regression is defined in °F
  const R = Math.max(0, Math.min(100, humidityPct));
  const hi =
    -42.379 +
    2.04901523 * T +
    10.14333127 * R -
    0.22475541 * T * R -
    0.00683783 * T * T -
    0.05481717 * R * R +
    0.00122874 * T * T * R +
    0.00085282 * T * R * R -
    0.00000199 * T * T * R * R;
  return Math.round((((hi - 32) * 5) / 9) * 10) / 10;
}

/** Metabolic heat production is what has to be shed; it scales with effort and mass. */
const INTENSITY_SWEAT_BASE: Record<Intensity, number> = {
  easy: 8,
  moderate: 11,
  hard: 14,
  race: 15.5,
};

const SWEAT_LEVEL_FACTOR = { light: 0.8, average: 1, heavy: 1.25 } as const;

/**
 * Population sweat sodium, mg/L. The spread between athletes is enormous
 * (roughly 200–2000 mg/L), which is exactly why the app pushes for a real sweat
 * test — this middle-of-the-road figure is a placeholder, not a finding.
 */
const DEFAULT_SWEAT_SODIUM_MG_PER_L = 800;

export function heatStrain(input: HeatInput): HeatStrain {
  const feelsLikeC = heatIndexC(input.temperatureC, input.humidityPct);

  // Base rate: ml/h per kg of body mass at this effort in temperate conditions.
  const basePerKg = INTENSITY_SWEAT_BASE[input.intensity];
  let sweat = basePerKg * input.bodyWeightKg;

  // Heat above ~15 °C adds roughly 3 % per degree — the classic linear region
  // before the athlete is simply overwhelmed.
  const overTemperate = Math.max(0, feelsLikeC - 15);
  sweat *= 1 + overTemperate * 0.03;

  // Humidity's own penalty: above 60 % evaporation starts failing, so sweat is
  // produced that never cools anything. Only applied when it is warm enough for
  // evaporative cooling to be the limiting factor at all.
  if (input.temperatureC >= 20 && input.humidityPct > 60) {
    sweat *= 1 + ((input.humidityPct - 60) / 40) * 0.15;
  }

  sweat *= SWEAT_LEVEL_FACTOR[input.sweatLevel ?? "average"];

  // A measurement beats every model here, and says so.
  const measured = input.measuredSweatRateMlPerH !== undefined;
  const sweatRateMlPerH = Math.round((measured ? input.measuredSweatRateMlPerH! : sweat) / 25) * 25;

  const sweatSodiumMgPerL = input.measuredSweatSodiumMgPerL ?? DEFAULT_SWEAT_SODIUM_MG_PER_L;
  const sodiumLossMgPerH = Math.round(((sweatRateMlPerH / 1000) * sweatSodiumMgPerL) / 10) * 10;

  // Glycogen use rises in the heat — the same power costs more carbohydrate.
  const carbBurnMultiplier = Math.round((1 + Math.min(0.25, Math.max(0, (feelsLikeC - 20) * 0.012))) * 100) / 100;

  const risk: HeatRisk =
    feelsLikeC >= 38 ? "extreme" : feelsLikeC >= 32 ? "high" : feelsLikeC >= 26 ? "moderate" : "low";

  const advice =
    risk === "extreme"
      ? `Feels like ${feelsLikeC} °C. Start cool, drink to thirst plus a bit, and accept a slower pace — heat, not fuel, is the limiter today.`
      : risk === "high"
        ? `Feels like ${feelsLikeC} °C. Plan ${sweatRateMlPerH} ml and ${sodiumLossMgPerH} mg sodium an hour, and drink early rather than catching up.`
        : risk === "moderate"
          ? `Feels like ${feelsLikeC} °C — about ${sweatRateMlPerH} ml an hour, with ${sweatSodiumMgPerL} mg sodium per litre.`
          : `Around ${sweatRateMlPerH} ml an hour is enough in these conditions.`;

  return {
    sweatRateMlPerH,
    sodiumLossMgPerH,
    sweatSodiumMgPerL,
    carbBurnMultiplier,
    feelsLikeC,
    risk,
    measured,
    advice,
  };
}

/** Map the app's coarse conditions band to a representative temperature. */
export function temperatureForConditions(conditions: Conditions): number {
  return conditions === "hot" ? 28 : conditions === "cool" ? 8 : 18;
}
