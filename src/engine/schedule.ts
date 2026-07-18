import { computeTarget } from "./recommend";
import type { AthleteInput } from "./types";

/**
 * In-session fueling schedule.
 *
 * The planner gives per-hour targets; this turns them into discrete, timed cues
 * an athlete (or a watch) can act on mid-session — "at 0:20, take 25 g carb +
 * 200 ml". This is the real-time "go further" layer: neither a device maker nor a
 * product brand delivers a personalized, timed fueling plan during the effort.
 */

const round5 = (n: number) => Math.round(n / 5) * 5;
const round10 = (n: number) => Math.round(n / 10) * 10;

export type CueKind = "start" | "carb" | "drink" | "caffeine" | "finish";

export interface FuelingCue {
  /** Minutes from the start of the session. */
  atMin: number;
  kind: CueKind;
  carbG?: number;
  fluidMl?: number;
  sodiumMg?: number;
  caffeine?: boolean;
  label: string;
}

export interface FuelingSchedule {
  totalMin: number;
  cues: FuelingCue[];
  totalCarbG: number;
  totalFluidMl: number;
}

export interface ScheduleOptions {
  /** Minutes between carbohydrate hits (default 20). */
  carbIntervalMin?: number;
  /** Minutes between drinking cues (default 15). */
  fluidIntervalMin?: number;
}

interface Accum {
  carbG?: number;
  fluidMl?: number;
  sodiumMg?: number;
  caffeine?: boolean;
}

const wantsCaffeine = (input: AthleteInput) =>
  Boolean(input.caffeineOk) && (input.durationMin >= 90 || input.intensity === "race" || input.intensity === "hard");

/** Format minutes as H:MM (or M:SS-style M min for sub-hour). */
export function formatClock(min: number): string {
  const m = Math.round(min);
  const h = Math.floor(m / 60);
  const mm = m % 60;
  return h > 0 ? `${h}:${String(mm).padStart(2, "0")}` : `0:${String(mm).padStart(2, "0")}`;
}

/** Build a timed fueling schedule for a session. */
export function buildSchedule(input: AthleteInput, opts: ScheduleOptions = {}): FuelingSchedule {
  const target = computeTarget(input);
  const totalMin = input.durationMin;
  const carbEvery = opts.carbIntervalMin ?? 20;
  const drinkEvery = opts.fluidIntervalMin ?? 15;

  const acc = new Map<number, Accum>();
  const bump = (min: number, patch: Accum) => {
    const cur = acc.get(min) ?? {};
    acc.set(min, {
      carbG: (cur.carbG ?? 0) + (patch.carbG ?? 0) || undefined,
      fluidMl: (cur.fluidMl ?? 0) + (patch.fluidMl ?? 0) || undefined,
      sodiumMg: (cur.sodiumMg ?? 0) + (patch.sodiumMg ?? 0) || undefined,
      caffeine: cur.caffeine || patch.caffeine || undefined,
    });
  };

  // Carbohydrate hits.
  if (target.carbPerHourG > 0) {
    const perHit = Math.max(5, round5((target.carbPerHourG * carbEvery) / 60));
    for (let t = carbEvery; t < totalMin; t += carbEvery) bump(t, { carbG: perHit });
  }

  // Drinking cues (fluid + its sodium).
  const perSip = round10((target.fluidPerHourMl * drinkEvery) / 60);
  if (perSip > 0) {
    for (let t = drinkEvery; t < totalMin; t += drinkEvery) {
      bump(t, { fluidMl: perSip, sodiumMg: Math.round((target.sodiumPerLitreMg * perSip) / 1000) });
    }
  }

  // A caffeine hit in the final third, snapped to the nearest existing cue.
  if (wantsCaffeine(input) && target.carbPerHourG > 0 && acc.size > 0) {
    const wantAt = Math.round((totalMin * 0.66) / carbEvery) * carbEvery;
    const times = [...acc.keys()];
    const nearest = times.reduce((a, b) => (Math.abs(b - wantAt) < Math.abs(a - wantAt) ? b : a));
    bump(nearest, { caffeine: true });
  }

  const cues: FuelingCue[] = [];
  cues.push({
    atMin: 0,
    kind: "start",
    label: "Start topped up — sip ~5–7 ml/kg fluid in the 2 h before.",
  });

  for (const [atMin, a] of [...acc.entries()].sort((x, y) => x[0] - y[0])) {
    const parts: string[] = [];
    if (a.carbG) parts.push(`${a.carbG} g carb`);
    if (a.fluidMl) parts.push(`${a.fluidMl} ml`);
    if (a.caffeine) parts.push("caffeine");
    const kind: CueKind = a.carbG ? "carb" : a.caffeine && !a.fluidMl ? "caffeine" : "drink";
    cues.push({ atMin, kind, ...a, label: parts.join(" + ") });
  }

  cues.push({
    atMin: totalMin,
    kind: "finish",
    label: "Finish — start recovery (carb + protein) within ~60 min.",
  });

  return {
    totalMin,
    cues,
    totalCarbG: [...acc.values()].reduce((s, a) => s + (a.carbG ?? 0), 0),
    totalFluidMl: [...acc.values()].reduce((s, a) => s + (a.fluidMl ?? 0), 0),
  };
}
