import type { Conditions } from "../engine";
import { conditionsForTemp, estimateWeather, type WeatherNow } from "../geo/weather";
import type { SwissEvent } from "./events";

/**
 * Race-day weather — the live half of an event plan.
 *
 * `src/geo/weather` answers "what is it like *now*", which is the right
 * question for a training session about to start and the wrong one for a race
 * in eleven days. Two things change:
 *
 * 1. **A future date.** Numerical weather models run about a fortnight ahead.
 *    Inside that window this is a real forecast that moves every day; outside
 *    it there is nothing to fetch, and the honest answer is a seasonal
 *    estimate that says so on its face.
 * 2. **The hours of the race, not the day.** A daily maximum is the wrong
 *    number twice over. The Jungfrau-Marathon starts at 09:00 and the field is
 *    on the Wengernalp climb between noon and two — the hottest part of the
 *    day, at the steepest part of the course. A 06:00 ultra start is the
 *    opposite: the daily max lands when the athlete is already six hours in and
 *    high enough that it never reaches the valley figure.
 *
 * So this averages the hours the athlete is actually out there, and separately
 * reports the *warmest* of them, because a plan built on the mean of a day that
 * runs 9 °C to 27 °C is a plan for a race nobody is running.
 */

/** How far ahead a numerical model has anything to say. Open-Meteo serves 16 days. */
export const FORECAST_HORIZON_DAYS = 16;

export interface RaceDayWeather extends WeatherNow {
  /** The date this describes, ISO `YYYY-MM-DD`. */
  date: string;
  /** Warmest hour inside the race window — what the fluid plan has to survive. */
  peakTemperatureC: number;
  /** Band of that peak hour, which is often one above the mean of the window. */
  peakConditions: Conditions;
  /** True when a real model run covered the date; false when this is climatology. */
  forecast: boolean;
  /**
   * Why there is no forecast — only set when `forecast` is false.
   *
   * The two cases need different words. "The race is in June, come back later"
   * is a fact about the calendar; "we could not reach the model" is a fact
   * about right now, and telling an athlete eleven days out to come back in
   * minus five days is worse than saying nothing.
   */
  estimateReason?: "outOfRange" | "unreachable";
  /** Local start hour and finish hour used for the average, e.g. `[9, 15]`. */
  window: [number, number];
}

const FORECAST_URL = "https://api.open-meteo.com/v1/forecast";

interface HourlyResponse {
  hourly?: {
    time?: string[];
    temperature_2m?: (number | null)[];
    relative_humidity_2m?: (number | null)[];
    wind_speed_10m?: (number | null)[];
  };
}

/** Whole days between today and a date, negative once it is past. */
export function daysUntil(dateIso: string, now = new Date()): number {
  const a = Date.parse(`${now.toISOString().slice(0, 10)}T00:00:00Z`);
  const b = Date.parse(`${dateIso.slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(a) || Number.isNaN(b)) return NaN;
  return Math.round((b - a) / 86_400_000);
}

/** Is there a model run that reaches this date at all? */
export function withinForecastRange(dateIso: string, now = new Date()): boolean {
  const d = daysUntil(dateIso, now);
  return Number.isFinite(d) && d >= 0 && d <= FORECAST_HORIZON_DAYS;
}

const mean = (xs: number[]) => xs.reduce((s, x) => s + x, 0) / xs.length;

/**
 * Reduce an hourly forecast to the race window.
 *
 * Returns `null` rather than a default when the response does not actually
 * cover the requested hours — a silently substituted 15 °C would be
 * indistinguishable from a forecast, which is exactly the confusion this whole
 * module exists to prevent.
 */
export function parseRaceDayForecast(
  data: HourlyResponse,
  date: string,
  startHour: number,
  durationMin: number,
): RaceDayWeather | null {
  const times = data.hourly?.time;
  const temps = data.hourly?.temperature_2m;
  if (!Array.isArray(times) || !Array.isArray(temps)) return null;

  // Inclusive of the finishing hour: an athlete crossing the line at 15:40 was
  // out in the 15:00 hour, and on a hot day that hour is the one that decides
  // whether the last two aid stations were enough.
  const endHour = Math.min(23, startHour + Math.ceil(durationMin / 60));
  const hums = data.hourly?.relative_humidity_2m ?? [];
  const winds = data.hourly?.wind_speed_10m ?? [];

  const t: number[] = [];
  const h: number[] = [];
  const w: number[] = [];
  for (let i = 0; i < times.length; i++) {
    const stamp = times[i];
    if (typeof stamp !== "string" || !stamp.startsWith(date)) continue;
    // Open-Meteo returns local time as `2026-09-12T14:00` — no zone suffix, so
    // the hour is read off the string rather than through Date, which would
    // reinterpret it in whatever zone the browser happens to be in.
    const hour = Number(stamp.slice(11, 13));
    if (!Number.isFinite(hour) || hour < startHour || hour > endHour) continue;
    const temp = temps[i];
    if (typeof temp !== "number") continue;
    t.push(temp);
    if (typeof hums[i] === "number") h.push(hums[i] as number);
    if (typeof winds[i] === "number") w.push(winds[i] as number);
  }
  if (t.length === 0) return null;

  const avg = Math.round(mean(t));
  const peak = Math.round(Math.max(...t));
  return {
    temperatureC: avg,
    humidityPct: h.length ? Math.round(mean(h)) : 60,
    windKmh: w.length ? Math.round(mean(w)) : 8,
    conditions: conditionsForTemp(avg),
    source: "forecast",
    sourceLabel: `ICON-CH model (MeteoSwiss) via Open-Meteo · ${date}, ${pad(startHour)}:00–${pad(endHour)}:00`,
    date,
    peakTemperatureC: peak,
    peakConditions: conditionsForTemp(peak),
    forecast: true,
    window: [startHour, endHour],
  };
}

/**
 * The seasonal fallback, kept deliberately plain.
 *
 * It reuses the same climatology the rest of the app falls back to rather than
 * inventing a second one, and it is marked `forecast: false` so every surface
 * downstream can say "September average" instead of pretending to know.
 */
export function estimateRaceDayWeather(
  event: SwissEvent,
  startHour = 9,
  durationMin = 300,
  reason: "outOfRange" | "unreachable" = "outOfRange",
): RaceDayWeather {
  const month = Number(event.date.slice(5, 7)) - 1;
  // The altitude correction is made **once**, inside `estimateWeather`, from a
  // real course altitude. Applying a lapse rate again out here on top of its
  // latitude proxy is the double correction that made a hot valley race read
  // as a cold one.
  //
  // Half the summit height stands in for the course average: an athlete is at
  // the top for minutes and in the valley for hours, so the mean of start and
  // summit is much closer to what they actually run in than the summit is.
  const courseAltM = event.maxAltM ? Math.round(event.maxAltM / 2) : undefined;
  const base = estimateWeather(event.start.lat, Number.isFinite(month) ? month : new Date().getMonth(), courseAltM);
  const avg = base.temperatureC;
  const endHour = Math.min(23, startHour + Math.ceil(durationMin / 60));
  return {
    ...base,
    temperatureC: avg,
    conditions: conditionsForTemp(avg),
    sourceLabel:
      reason === "unreachable"
        ? "Seasonal average — the forecast model could not be reached"
        : "Seasonal average — too far out for a forecast",
    date: event.date,
    estimateReason: reason,
    // Midday runs warmer than the day's mean; the swing is what a plan has to
    // cover, and understating it is the failure that costs an athlete a race.
    peakTemperatureC: avg + 4,
    peakConditions: conditionsForTemp(avg + 4),
    forecast: false,
    window: [startHour, endHour],
  };
}

/**
 * Weather for the race, live when live exists.
 *
 * Never rejects and never blocks a plan: an unreachable model degrades to the
 * seasonal estimate with `forecast: false`, which is a worse answer honestly
 * labelled rather than a better one invented.
 */
export async function fetchRaceDayWeather(
  event: SwissEvent,
  opts: { startHour?: number; durationMin?: number; now?: Date } = {},
): Promise<RaceDayWeather> {
  const startHour = opts.startHour ?? 9;
  const durationMin = opts.durationMin ?? 300;
  if (!withinForecastRange(event.date, opts.now ?? new Date())) {
    return estimateRaceDayWeather(event, startHour, durationMin);
  }
  try {
    const url =
      `${FORECAST_URL}?latitude=${event.start.lat}&longitude=${event.start.lng}` +
      `&hourly=temperature_2m,relative_humidity_2m,wind_speed_10m` +
      `&start_date=${event.date}&end_date=${event.date}&timezone=Europe%2FZurich`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`forecast ${res.status}`);
    const parsed = parseRaceDayForecast((await res.json()) as HourlyResponse, event.date, startHour, durationMin);
    // In range but nothing usable came back: that is "unreachable", not "too
    // far out", and the athlete is told which.
    return parsed ?? estimateRaceDayWeather(event, startHour, durationMin, "unreachable");
  } catch {
    return estimateRaceDayWeather(event, startHour, durationMin, "unreachable");
  }
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}
