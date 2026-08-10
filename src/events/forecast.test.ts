import { describe, expect, it } from "vitest";
import { eventById } from "./catalogue";
import type { SwissEvent } from "./events";
import {
  FORECAST_HORIZON_DAYS,
  daysUntil,
  estimateRaceDayWeather,
  parseRaceDayForecast,
  withinForecastRange,
} from "./forecast";

const JUNGFRAU = eventById("jungfrau-marathon") as SwissEvent;

/**
 * An Open-Meteo hourly response in the shape the API actually returns: local
 * time with no zone suffix, one entry an hour, the whole day.
 */
function hourly(date: string, tempsByHour: Record<number, number>) {
  const time: string[] = [];
  const temperature_2m: number[] = [];
  const relative_humidity_2m: number[] = [];
  const wind_speed_10m: number[] = [];
  for (let h = 0; h < 24; h++) {
    time.push(`${date}T${String(h).padStart(2, "0")}:00`);
    temperature_2m.push(tempsByHour[h] ?? 10);
    relative_humidity_2m.push(60);
    wind_speed_10m.push(8);
  }
  return { hourly: { time, temperature_2m, relative_humidity_2m, wind_speed_10m } };
}

describe("forecast range", () => {
  it("counts days to the race", () => {
    expect(daysUntil("2026-09-12", new Date("2026-09-01T22:00:00Z"))).toBe(11);
    expect(daysUntil("2026-09-12", new Date("2026-09-13T02:00:00Z"))).toBe(-1);
  });

  it("only claims a forecast where a model run reaches", () => {
    const now = new Date("2026-09-01T08:00:00Z");
    expect(withinForecastRange("2026-09-12", now)).toBe(true);
    expect(withinForecastRange(`2026-09-${17 + 1}`, now)).toBe(false);
    expect(daysUntil("2026-09-17", now)).toBe(FORECAST_HORIZON_DAYS);
    // A race already run is not "in range" just because it is nearby.
    expect(withinForecastRange("2026-08-30", now)).toBe(false);
  });
});

describe("parsing the race window", () => {
  const hot = hourly("2026-09-12", { 9: 12, 10: 15, 11: 19, 12: 24, 13: 27, 14: 26, 15: 22 });

  it("averages the hours the athlete is out, not the calendar day", () => {
    // 03:00 is 10 °C in the fixture and must not drag the average down.
    const w = parseRaceDayForecast(hot, "2026-09-12", 9, 360);
    expect(w?.temperatureC).toBe(21); // mean of 09:00–15:00
  });

  it("reports the warmest hour separately, because that is what the plan must survive", () => {
    const w = parseRaceDayForecast(hot, "2026-09-12", 9, 360);
    expect(w?.peakTemperatureC).toBe(27);
    expect(w?.peakConditions).toBe("hot");
  });

  it("puts a slower athlete into hours the fast one never sees", () => {
    // A four-hour finisher is home before the peak; a seven-hour one is not.
    const fast = parseRaceDayForecast(hourly("2026-09-12", { 6: 8, 7: 9, 8: 11, 9: 14, 12: 26, 13: 27 }), "2026-09-12", 6, 180);
    const slow = parseRaceDayForecast(hourly("2026-09-12", { 6: 8, 7: 9, 8: 11, 9: 14, 12: 26, 13: 27 }), "2026-09-12", 6, 420);
    expect(fast?.peakTemperatureC).toBe(14);
    expect(slow?.peakTemperatureC).toBe(27);
  });

  it("includes the finishing hour", () => {
    const w = parseRaceDayForecast(hot, "2026-09-12", 9, 340); // finishes 14:40
    expect(w?.window).toEqual([9, 15]);
  });

  it("reads the hour off the string rather than through a Date", () => {
    // Open-Meteo sends local time with no zone. Parsing it as a Date would shift
    // the window by the test machine's offset and silently pick other hours.
    const w = parseRaceDayForecast(hot, "2026-09-12", 13, 60);
    expect(w?.temperatureC).toBe(27); // 13:00 and 14:00 → 26.5, rounded
  });

  it("ignores other days in the same response", () => {
    const two = hourly("2026-09-12", { 9: 20 });
    two.hourly.time.push("2026-09-13T09:00");
    two.hourly.temperature_2m.push(40);
    expect(parseRaceDayForecast(two, "2026-09-12", 9, 60)?.peakTemperatureC).toBeLessThan(30);
  });

  it("returns null rather than a plausible default when the data does not cover the race", () => {
    expect(parseRaceDayForecast(hourly("2026-09-11", {}), "2026-09-12", 9, 300)).toBeNull();
    expect(parseRaceDayForecast({}, "2026-09-12", 9, 300)).toBeNull();
  });

  it("labels itself a model, with the window it covered", () => {
    const w = parseRaceDayForecast(hot, "2026-09-12", 9, 360);
    expect(w?.forecast).toBe(true);
    expect(w?.source).toBe("forecast");
    expect(w?.sourceLabel).toContain("09:00–15:00");
  });
});

describe("the seasonal fallback", () => {
  it("says plainly that it is not a forecast", () => {
    const w = estimateRaceDayWeather(JUNGFRAU, 9, 300);
    expect(w.forecast).toBe(false);
    expect(w.source).toBe("estimated");
    expect(w.sourceLabel).toMatch(/too far out/i);
  });

  it("separates 'too far out' from 'could not reach the model'", () => {
    // Both are seasonal averages, and they mean different things to an athlete:
    // one resolves with time, the other with a connection. Telling someone
    // eleven days out to "check back in −5 days" is the bug this prevents.
    expect(estimateRaceDayWeather(JUNGFRAU, 9, 300).estimateReason).toBe("outOfRange");
    const down = estimateRaceDayWeather(JUNGFRAU, 9, 300, "unreachable");
    expect(down.estimateReason).toBe("unreachable");
    expect(down.sourceLabel).toMatch(/could not be reached/i);
  });

  it("does not stack two altitude corrections on one estimate", () => {
    // A latitude proxy for altitude plus a real lapse rate on top of it put a
    // hot August valley race at 6 °C, which would have argued an athlete out of
    // the fluid they needed. Sierre-Zinal in August is warm, not cold.
    const sierre = eventById("sierre-zinal") as SwissEvent;
    const w = estimateRaceDayWeather(sierre, 9, 240);
    expect(w.temperatureC).toBeGreaterThan(10);
    expect(w.conditions).not.toBe("cool");
  });

  it("uses the month of the race, not the month it was asked in", () => {
    const july = estimateRaceDayWeather({ ...JUNGFRAU, date: "2026-07-12" });
    const january = estimateRaceDayWeather({ ...JUNGFRAU, date: "2026-01-12" });
    expect(july.temperatureC).toBeGreaterThan(january.temperatureC);
  });

  it("keeps a peak above the mean, so an estimate is never read as a flat day", () => {
    const w = estimateRaceDayWeather(JUNGFRAU);
    expect(w.peakTemperatureC).toBeGreaterThan(w.temperatureC);
  });

  it("cools a course that finishes high", () => {
    const high = estimateRaceDayWeather({ ...JUNGFRAU, maxAltM: 2600 });
    const low = estimateRaceDayWeather({ ...JUNGFRAU, maxAltM: 600 });
    expect(high.temperatureC).toBeLessThan(low.temperatureC);
  });
});
