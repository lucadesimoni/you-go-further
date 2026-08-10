import type { Activity, AthleteInput, FuellingTarget, SweatLevel } from "../engine";
import { computeTarget } from "../engine";
import { estimateDurationMin } from "../geo/gpx";
import type { Activity as SyncedActivity } from "../model";
import {
  carryLegs,
  enduranceRatio,
  eventAdvice,
  eventCountdown,
  longestRecentMin,
  type CarryLeg,
  type EventAdvice,
  type EventCountdown,
  type EventDiscipline,
  type SwissEvent,
} from "./events";
import { estimateRaceDayWeather, fetchRaceDayWeather, type RaceDayWeather } from "./forecast";

/**
 * An event plan: everything a coach would say about one named race, today.
 *
 * The distinction that matters is between this and the session planner. The
 * planner answers "I am going out for four hours, what do I take?" — a question
 * whose answer is the same in March and in September. A race has a *date*, and
 * almost everything useful follows from it: the same athlete, the same course
 * and the same target produce different advice nine weeks out and two days out,
 * and the day the real forecast reaches the date is the day the fluid plan
 * stops being a guess.
 *
 * {@link buildEventPlan} is pure — weather goes in, a plan comes out — so the
 * whole thing is testable without a network. {@link planEvent} is the thin
 * wrapper that fetches first.
 */

/** What each discipline runs at on the flat, min/km, before the climbing is added. */
const FLAT_PACE: Record<EventDiscipline, number> = {
  "road-run": 5.5,
  "trail-run": 6.5,
  "ultra-trail": 8.5,
  triathlon: 5,
  cycling: 2,
};

const ACTIVITY: Record<EventDiscipline, Activity> = {
  "road-run": "running",
  "trail-run": "trail-running",
  "ultra-trail": "trail-running",
  triathlon: "triathlon",
  cycling: "cycling",
};

/** Below this share of race duration, the longest recent session is the story. */
export const READINESS_RATIO = 0.6;

/** Where thin air starts changing appetite and fluid loss enough to mention. */
export const ALTITUDE_M = 2000;

export interface EventPlanInput {
  event: SwissEvent;
  bodyWeightKg: number;
  sweatLevel?: SweatLevel;
  /** The athlete's own finish estimate, in minutes. Beats ours whenever it is given. */
  estimatedMin?: number;
  /** Their flat pace, min/km, when they have not given a finish time. */
  flatPaceMinPerKm?: number;
  /** Local start time, 24 h. Organisers publish it; the athlete can correct it. */
  startHour?: number;
  /** Race-day weather, live or estimated. Omit and the plan runs on climatology. */
  weather?: RaceDayWeather;
  /** The athlete's synced sessions, for the readiness check. */
  activities?: SyncedActivity[];
  now?: Date;
}

export interface EventPlan {
  event: SwissEvent;
  countdown: EventCountdown;
  /** Finish estimate in minutes, and where the number came from. */
  estimatedMin: number;
  estimateSource: "athlete" | "derived";
  target: FuellingTarget;
  /** The session shape the target was computed from, ready for the planner. */
  session: AthleteInput;
  advice: EventAdvice[];
  /** Aid-station to aid-station, empty when the organiser's stations are unknown. */
  legs: CarryLeg[];
  weather: RaceDayWeather;
  readiness: { longestMin: number; ratio: number } | null;
}

/** Finish estimate from the course itself, when the athlete has not given one. */
export function estimateFinishMin(event: SwissEvent, flatPaceMinPerKm?: number): number {
  const pace = flatPaceMinPerKm ?? FLAT_PACE[event.discipline];
  return estimateDurationMin(
    event.distanceKm,
    event.ascentM,
    pace,
    event.discipline === "cycling" ? "ride" : "run",
  );
}

/**
 * Build the plan.
 *
 * The order of `advice` is the order of urgency, not of derivation: what is
 * true only today comes before what is true all season. An athlete reads three
 * lines, so the third one has to be worth the space.
 */
export function buildEventPlan(input: EventPlanInput): EventPlan {
  const { event, bodyWeightKg } = input;
  const now = input.now ?? new Date();
  const countdown = eventCountdown(event, now);
  const estimatedMin = input.estimatedMin ?? estimateFinishMin(event, input.flatPaceMinPerKm);
  const startHour = input.startHour ?? 9;
  const weather = input.weather ?? estimateRaceDayWeather(event, startHour, estimatedMin);

  // The plan is built for the *peak* of the race window, not its average. An
  // athlete who drinks to the mean of a day that touches 27 °C is short on the
  // climb that matters, and the whole point of the hourly forecast is to know
  // that before the day rather than after it.
  const session: AthleteInput = {
    goal: "race-preparation",
    activity: ACTIVITY[event.discipline],
    durationMin: estimatedMin,
    intensity: "race",
    bodyWeightKg,
    conditions: weather.peakConditions,
    ...(input.sweatLevel ? { sweatLevel: input.sweatLevel } : {}),
  };
  const target = computeTarget(session);

  const advice = eventAdvice(event, countdown, bodyWeightKg, target.carbPerHourG);

  // Race-day conditions, which change what to carry rather than what to train.
  if (weather.peakConditions === "hot") {
    advice.unshift({
      id: "heatDay",
      severity: "act",
      values: { peakC: weather.peakTemperatureC, fluidMl: target.fluidPerHourMl, sodiumMg: target.sodiumPerLitreMg },
    });
  } else if (weather.conditions === "cool") {
    advice.push({ id: "coldDay", severity: "info", values: { tempC: weather.temperatureC } });
  }
  if (event.maxAltM && event.maxAltM >= ALTITUDE_M) {
    advice.push({ id: "altitude", severity: "info", values: { altM: event.maxAltM } });
  }

  // A cut-off the athlete is close to changes the plan more than any of it: the
  // fuelling for a race you might not finish inside the limit is the fuelling
  // for the pace that gets you there, which is a different race.
  if (event.cutoffMin && estimatedMin > event.cutoffMin * 0.9) {
    advice.unshift({
      id: "cutoffTight",
      severity: "act",
      values: { cutoffMin: event.cutoffMin, estimatedMin },
    });
  }

  // Readiness: what a coach asks before anything about food.
  let readiness: EventPlan["readiness"] = null;
  if (input.activities && input.activities.length > 0) {
    const longestMin = Math.round(longestRecentMin(input.activities, now));
    const ratio = enduranceRatio(longestMin, estimatedMin);
    readiness = { longestMin, ratio };
    if (ratio > 0 && ratio < READINESS_RATIO && countdown.phase !== "done") {
      advice.push({ id: "longestShort", severity: "act", values: { longestMin, estimatedMin, pct: Math.round(ratio * 100) } });
    }
  }

  return {
    event,
    countdown,
    estimatedMin,
    estimateSource: input.estimatedMin ? "athlete" : "derived",
    target,
    session,
    advice,
    legs: carryLegs(event, estimatedMin, target.carbPerHourG, target.fluidPerHourMl),
    weather,
    readiness,
  };
}

/** {@link buildEventPlan} with race-day weather fetched first. */
export async function planEvent(input: EventPlanInput): Promise<EventPlan> {
  const estimatedMin = input.estimatedMin ?? estimateFinishMin(input.event, input.flatPaceMinPerKm);
  const weather =
    input.weather ??
    (await fetchRaceDayWeather(input.event, {
      startHour: input.startHour ?? 9,
      durationMin: estimatedMin,
      ...(input.now ? { now: input.now } : {}),
    }));
  return buildEventPlan({ ...input, weather });
}
