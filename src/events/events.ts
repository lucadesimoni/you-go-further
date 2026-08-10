import type { Activity } from "../model";

/**
 * Named events — the races an athlete is actually training for.
 *
 * A planner that only knows "a 4-hour trail run next Saturday" is a calculator.
 * A coach knows you are running the Jungfrau-Marathon in nine weeks, that the
 * climb starts at Lauterbrunnen, that the organiser hands out isotonic drink at
 * seven points, and that the fuelling you rehearse *now* is the fuelling that
 * has to work on the day.
 *
 * Three things make this more than a saved GPX:
 *
 * 1. **A date.** Everything a coach says changes with how far out you are —
 *    gut training in the build, carbohydrate loading in the last 48 hours,
 *    nothing new in race week.
 * 2. **Aid stations.** What the organiser provides decides what you carry, and
 *    it is the single most common thing athletes get wrong on a first ultra.
 * 3. **The forecast, as it comes into range.** A September race planned in June
 *    can only use climate; ten days out it can use the actual forecast, and the
 *    plan should change when it does.
 */

export type EventDiscipline = "road-run" | "trail-run" | "ultra-trail" | "triathlon" | "cycling";

/** What an aid station actually has, which decides what the athlete carries. */
export interface AidStation {
  /** Distance into the course, km. */
  atKm: number;
  name: string;
  /** Water only, or food too. */
  water: boolean;
  sportsDrink: boolean;
  food: boolean;
  /** Some races only let you take a drop bag at certain points. */
  dropBag?: boolean;
}

export interface SwissEvent {
  id: string;
  name: string;
  /** Where it starts, for weather and terrain. */
  start: { lat: number; lng: number };
  discipline: EventDiscipline;
  distanceKm: number;
  ascentM: number;
  /** Highest point, m — altitude changes both fluid loss and appetite. */
  maxAltM?: number;
  /**
   * The date it is next held, ISO `YYYY-MM-DD`.
   *
   * Curated from the organiser's published calendar and **worth checking**:
   * most Swiss races move by a week year to year, and this list cannot phone
   * them up. The athlete can override it, and the UI says where it came from.
   */
  date: string;
  /** True when the date is the usual weekend rather than a confirmed one. */
  dateApproximate?: boolean;
  /**
   * Where a confirmed date came from, set by the refresh script from the
   * organiser's own schema.org markup or calendar feed. Its presence is what
   * distinguishes "we fetched this" from "we assumed this".
   */
  confirmedFrom?: string;
  /** When that fetch happened, so a stale confirmation is visible as one. */
  confirmedAt?: string;
  aidStations?: AidStation[];
  /** Cut-off, minutes — a slower athlete's plan is a different plan. */
  cutoffMin?: number;
  organiserUrl?: string;
  /** One line an athlete recognises the race by. */
  note?: string;
}

/**
 * How far out the athlete is, and what that means for eating.
 *
 * The boundaries are the ones sports nutrition actually uses, not round
 * numbers: carbohydrate loading is a 36–48 hour protocol, "nothing new" starts
 * about a week out, and gut training needs repeated exposure over weeks rather
 * than a single long run.
 */
export type EventPhase = "base" | "build" | "taper" | "raceWeek" | "raceDay" | "done";

export interface EventCountdown {
  daysOut: number;
  weeksOut: number;
  phase: EventPhase;
  /** True on the day itself. */
  isToday: boolean;
}

/** Days between two dates, ignoring the time of day. */
function daysBetween(fromIso: string, toIso: string): number {
  const a = Date.parse(`${fromIso.slice(0, 10)}T00:00:00Z`);
  const b = Date.parse(`${toIso.slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(a) || Number.isNaN(b)) return NaN;
  return Math.round((b - a) / 86_400_000);
}

export function eventCountdown(event: SwissEvent, now = new Date()): EventCountdown {
  const daysOut = daysBetween(now.toISOString(), event.date);
  const weeksOut = Math.floor(daysOut / 7);
  const phase: EventPhase =
    Number.isNaN(daysOut) || daysOut < 0
      ? "done"
      : daysOut === 0
        ? "raceDay"
        : daysOut <= 7
          ? "raceWeek"
          : daysOut <= 21
            ? "taper"
            : daysOut <= 56
              ? "build"
              : "base";
  return { daysOut, weeksOut, phase, isToday: daysOut === 0 };
}

/**
 * What to do about nutrition right now, given how far out the race is.
 *
 * Each item is an id the UI translates plus the numbers behind it — the same
 * contract the engine's warnings use, so this reads in the athlete's language
 * and a licensee can write their own copy.
 */
export type EventAdviceId =
  | "gutTraining"
  | "rehearseRace"
  | "taperCarbs"
  | "carbLoad"
  | "nothingNew"
  | "raceMorning"
  | "afterRace"
  | "checkAidStations"
  | "carryOwn"
  | "cutoffTight"
  | "heatDay"
  | "coldDay"
  | "longestShort"
  | "altitude";

export interface EventAdvice {
  id: EventAdviceId;
  severity: "info" | "act";
  values: Record<string, number>;
}

/** Carbohydrate loading target, g per kg of body mass per day, for the last 36–48 h. */
export const CARB_LOAD_G_PER_KG = 9;

/**
 * The coach's list for today.
 *
 * Deliberately short: three things an athlete will actually do beats eight they
 * will skim. Ordered so the most time-critical is first.
 */
export function eventAdvice(
  event: SwissEvent,
  countdown: EventCountdown,
  bodyWeightKg: number,
  targetCarbPerHourG: number,
): EventAdvice[] {
  const out: EventAdvice[] = [];
  const loadG = Math.round(bodyWeightKg * CARB_LOAD_G_PER_KG);

  switch (countdown.phase) {
    case "base":
      out.push({ id: "gutTraining", severity: "info", values: { target: targetCarbPerHourG } });
      break;
    case "build":
      out.push({ id: "rehearseRace", severity: "act", values: { target: targetCarbPerHourG, weeks: countdown.weeksOut } });
      out.push({ id: "gutTraining", severity: "info", values: { target: targetCarbPerHourG } });
      break;
    case "taper":
      out.push({ id: "taperCarbs", severity: "info", values: { days: countdown.daysOut } });
      out.push({ id: "rehearseRace", severity: "info", values: { target: targetCarbPerHourG, weeks: countdown.weeksOut } });
      break;
    case "raceWeek":
      out.push({ id: "nothingNew", severity: "act", values: { days: countdown.daysOut } });
      // The loading window is 36–48 h, so it opens two days out, not on Monday.
      if (countdown.daysOut <= 2) {
        out.push({ id: "carbLoad", severity: "act", values: { gramsPerDay: loadG, perKg: CARB_LOAD_G_PER_KG } });
      }
      break;
    case "raceDay":
      out.push({ id: "raceMorning", severity: "act", values: { carbG: Math.round(bodyWeightKg * 2) } });
      break;
    case "done":
      out.push({ id: "afterRace", severity: "info", values: {} });
      break;
  }

  // Aid stations are what decides whether the plan is even carryable, so this
  // is relevant at every phase — and most wrong on a first long trail race.
  if (event.aidStations && event.aidStations.length > 0) {
    const withFood = event.aidStations.filter((a) => a.food).length;
    out.push({ id: "checkAidStations", severity: "info", values: { stations: event.aidStations.length, withFood } });
  } else if (event.distanceKm >= 20) {
    out.push({ id: "carryOwn", severity: "act", values: { km: event.distanceKm } });
  }

  return out;
}

/**
 * The longest session in the athlete's recent training, for a readiness check.
 *
 * A coach's first question about a 100 km race is not what you will eat, it is
 * whether you have been on your feet for six hours yet. Nutrition advice
 * without that context is advice for a race the athlete is not doing.
 */
export function longestRecentMin(activities: Activity[], now = new Date(), days = 56): number {
  const cutoff = now.getTime() - days * 86_400_000;
  return activities
    .filter((a) => Date.parse(a.startTime) >= cutoff)
    .reduce((max, a) => Math.max(max, a.durationSec / 60), 0);
}

/**
 * Is the longest recent session anywhere near the race?
 *
 * Returns the ratio, so the UI can say "your longest run is a third of race
 * duration" rather than passing or failing someone.
 */
export function enduranceRatio(longestMin: number, estimatedRaceMin: number): number {
  if (estimatedRaceMin <= 0) return 0;
  return Math.round((longestMin / estimatedRaceMin) * 100) / 100;
}

/**
 * What has to be in the pockets between one aid station and the next.
 *
 * This is the calculation athletes get wrong, and they get it wrong in a
 * specific way: they work out the total — "I need 400 g of carbohydrate for the
 * race" — and never work out that 90 g of it has to be *on them* for the
 * ninety minutes between km 21 and km 34, because the station in between has
 * water only. The total is a shopping list. The legs are the plan.
 *
 * Pace is taken as constant across the distance, which it is not: everyone
 * slows, and on a mountain course the second half of a leg can take half again
 * as long as the first. It is the right simplification anyway — an athlete who
 * carries for the average leg and finds it took longer is short, so the numbers
 * here round up rather than to nearest.
 */
export interface CarryLeg {
  fromKm: number;
  toKm: number;
  /** The aid station this leg starts from — absent for the start line. */
  fromName?: string;
  /** The one it ends at — absent for the finish. */
  toName?: string;
  minutes: number;
  carbG: number;
  fluidMl: number;
  /**
   * True when everything on this leg has to come out of the athlete's own kit:
   * the station at the far end has no food, so nothing can be deferred to it.
   */
  mustCarry: boolean;
}

export function carryLegs(
  event: SwissEvent,
  estimatedMin: number,
  carbPerHourG: number,
  fluidPerHourMl: number,
): CarryLeg[] {
  const stations = [...(event.aidStations ?? [])]
    .filter((s) => s.atKm > 0 && s.atKm < event.distanceKm)
    .sort((a, b) => a.atKm - b.atKm);
  if (estimatedMin <= 0 || event.distanceKm <= 0) return [];
  // No known stations means no known legs. The tempting alternative — one leg
  // from the start line to the finish — reads as "this race has no aid at all",
  // which for a race we simply have no data on is a claim, not an absence. The
  // `carryOwn` advice says the same thing without inventing a course profile.
  if (stations.length === 0) return [];

  const minPerKm = estimatedMin / event.distanceKm;
  const marks = [0, ...stations.map((s) => s.atKm), event.distanceKm];
  const out: CarryLeg[] = [];

  for (let i = 0; i < marks.length - 1; i++) {
    const fromKm = marks[i];
    const toKm = marks[i + 1];
    const minutes = Math.round((toKm - fromKm) * minPerKm);
    const from = i > 0 ? stations[i - 1] : undefined;
    const to = i < stations.length ? stations[i] : undefined;
    out.push({
      fromKm: Math.round(fromKm * 10) / 10,
      toKm: Math.round(toKm * 10) / 10,
      ...(from ? { fromName: from.name } : {}),
      ...(to ? { toName: to.name } : {}),
      minutes,
      // Round up: being 10 g over costs nothing, being 10 g under costs the race.
      carbG: Math.ceil((carbPerHourG * minutes) / 60),
      fluidMl: Math.ceil((fluidPerHourMl * minutes) / 60 / 50) * 50,
      mustCarry: !to || !to.food,
    });
  }
  return out;
}
