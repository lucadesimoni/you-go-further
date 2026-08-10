import { describe, expect, it } from "vitest";
import type { Activity } from "../model";
import { eventById } from "./catalogue";
import type { SwissEvent } from "./events";
import { estimateRaceDayWeather, type RaceDayWeather } from "./forecast";
import { buildEventPlan, estimateFinishMin, planEvent } from "./plan";

const JUNGFRAU = eventById("jungfrau-marathon") as SwissEvent;
const at = (iso: string) => new Date(`${iso}T08:00:00Z`);

const weatherAt = (tempC: number, peakC = tempC): RaceDayWeather => ({
  ...estimateRaceDayWeather(JUNGFRAU),
  temperatureC: tempC,
  conditions: tempC < 10 ? "cool" : tempC > 22 ? "hot" : "temperate",
  peakTemperatureC: peakC,
  peakConditions: peakC < 10 ? "cool" : peakC > 22 ? "hot" : "temperate",
});

const base = { event: JUNGFRAU, bodyWeightKg: 70, now: at("2026-08-01"), weather: weatherAt(16) };

describe("finish estimate", () => {
  it("charges the climbing, not only the distance", () => {
    const flat = estimateFinishMin({ ...JUNGFRAU, ascentM: 0 }, 6);
    expect(estimateFinishMin(JUNGFRAU, 6)).toBeGreaterThan(flat);
  });

  it("puts an ultra-trail default slower than a road marathon default", () => {
    const road = eventById("zurich-marathon") as SwissEvent;
    const ultra = eventById("eiger-ultra-e101") as SwissEvent;
    expect(estimateFinishMin(ultra) / ultra.distanceKm).toBeGreaterThan(estimateFinishMin(road) / road.distanceKm);
  });

  it("prefers the athlete's own number and says where it came from", () => {
    expect(buildEventPlan({ ...base, estimatedMin: 300 }).estimateSource).toBe("athlete");
    expect(buildEventPlan(base).estimateSource).toBe("derived");
    expect(buildEventPlan({ ...base, estimatedMin: 300 }).estimatedMin).toBe(300);
  });
});

describe("the plan", () => {
  it("builds the target for the hottest hour of the race, not the average one", () => {
    // A day that means 18 °C and peaks at 26 °C is a hot race. Planning fluid on
    // the mean is how an athlete arrives at the last climb already short.
    const mild = buildEventPlan({ ...base, weather: weatherAt(18, 18) });
    const swinging = buildEventPlan({ ...base, weather: weatherAt(18, 26) });
    expect(swinging.session.conditions).toBe("hot");
    expect(swinging.target.fluidPerHourMl).toBeGreaterThan(mild.target.fluidPerHourMl);
  });

  it("plans the race at race intensity", () => {
    expect(buildEventPlan(base).session.intensity).toBe("race");
    expect(buildEventPlan(base).session.durationMin).toBe(buildEventPlan(base).estimatedMin);
  });

  it("puts heat first, because it changes today's shopping and not next month's training", () => {
    const plan = buildEventPlan({ ...base, weather: weatherAt(24, 28) });
    expect(plan.advice[0].id).toBe("heatDay");
    expect(plan.advice[0].values.peakC).toBe(28);
  });

  it("puts a tight cut-off ahead of even the heat", () => {
    // Jungfrau's cut-off is 405 min; a 6-pace estimate lands close to it.
    const slow = buildEventPlan({ ...base, estimatedMin: 400, weather: weatherAt(24, 28) });
    expect(slow.advice[0].id).toBe("cutoffTight");
    expect(slow.advice[0].values.cutoffMin).toBe(405);
  });

  it("leaves the cut-off alone when there is real margin", () => {
    const fast = buildEventPlan({ ...base, estimatedMin: 240 });
    expect(fast.advice.map((a) => a.id)).not.toContain("cutoffTight");
  });

  it("mentions altitude only for the races that reach it", () => {
    const high = buildEventPlan(base).advice.map((a) => a.id);
    const low = buildEventPlan({ ...base, event: eventById("zurich-marathon") as SwissEvent }).advice.map((a) => a.id);
    expect(high).toContain("altitude");
    expect(low).not.toContain("altitude");
  });

  it("says something about a cold race too", () => {
    const cold = buildEventPlan({ ...base, weather: weatherAt(5, 8) }).advice.map((a) => a.id);
    expect(cold).toContain("coldDay");
  });
});

describe("readiness in the plan", () => {
  const session = (daysAgo: number, hours: number): Activity => ({
    id: `a${daysAgo}`,
    provider: "garmin",
    externalId: `e${daysAgo}`,
    sport: "trail-run",
    startTime: new Date(Date.parse("2026-08-01T06:00:00Z") - daysAgo * 86_400_000).toISOString(),
    durationSec: hours * 3600,
    distanceM: hours * 9000,
  });

  it("says nothing at all without synced sessions, rather than assuming the worst", () => {
    const plan = buildEventPlan(base);
    expect(plan.readiness).toBeNull();
    expect(plan.advice.map((a) => a.id)).not.toContain("longestShort");
  });

  it("raises the longest run when it is nowhere near race duration", () => {
    const plan = buildEventPlan({ ...base, activities: [session(7, 1.5)], estimatedMin: 360 });
    expect(plan.readiness?.longestMin).toBe(90);
    expect(plan.advice.map((a) => a.id)).toContain("longestShort");
  });

  it("stays quiet when the athlete has done the distance", () => {
    const plan = buildEventPlan({ ...base, activities: [session(7, 5)], estimatedMin: 360 });
    expect(plan.advice.map((a) => a.id)).not.toContain("longestShort");
  });

  it("does not lecture about training for a race already run", () => {
    const done = buildEventPlan({ ...base, now: at("2026-10-01"), activities: [session(200, 1)], estimatedMin: 360 });
    expect(done.advice.map((a) => a.id)).not.toContain("longestShort");
  });
});

describe("planEvent", () => {
  it("falls back to the seasonal estimate when the date is out of model range", async () => {
    // Nine months out there is nothing to fetch, and the plan must still exist.
    const plan = await planEvent({ event: JUNGFRAU, bodyWeightKg: 70, now: at("2025-12-01") });
    expect(plan.weather.forecast).toBe(false);
    expect(plan.target.carbPerHourG).toBeGreaterThan(0);
  });

  it("carries the athlete's estimate into the weather window it asks for", async () => {
    // The forecast window has to follow the finish time, or a seven-hour athlete
    // gets a three-hour athlete's weather.
    const plan = await planEvent({ event: JUNGFRAU, bodyWeightKg: 70, estimatedMin: 420, startHour: 9, now: at("2025-12-01") });
    expect(plan.weather.window).toEqual([9, 16]);
  });
});
