import { computeTarget } from "./recommend";
import type { AthleteInput } from "./types";

/**
 * In-session fuelling schedule.
 *
 * The planner gives per-hour targets; this turns them into discrete, timed cues
 * an athlete (or a watch) can act on mid-session — "at 0:20, take 25 g carb +
 * 200 ml". This is the real-time "go further" layer: neither a device maker nor a
 * product brand delivers a personalised, timed fuelling plan during the effort.
 */

const round5 = (n: number) => Math.round(n / 5) * 5;
const round10 = (n: number) => Math.round(n / 10) * 10;

export type CueKind = "start" | "carb" | "drink" | "caffeine" | "finish";

export interface FuellingCue {
  /** Minutes from the start of the session. */
  atMin: number;
  kind: CueKind;
  carbG?: number;
  fluidMl?: number;
  sodiumMg?: number;
  caffeine?: boolean;
  /**
   * English, for API consumers and anything without a dictionary.
   *
   * A surface that has one should render {@link FuellingCue.parts} instead: the
   * engine has no business deciding which language an athlete reads, and a
   * sentence it assembled cannot be translated after the fact.
   */
  label: string;
  /**
   * The same instruction as data — what to take, in what unit, how much.
   * A UI joins these in its own language.
   */
  parts: CuePart[];
}

/** One item of an instruction: "25 g carb", "140 ml", "caffeine". */
export type CuePart =
  | { kind: "carb"; grams: number }
  | { kind: "fluid"; millilitres: number }
  | { kind: "caffeine" }
  | { kind: "startTopUp" }
  | { kind: "finishRecovery" };

export interface FuellingSchedule {
  totalMin: number;
  cues: FuellingCue[];
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

/**
 * How long before the finish the last carbohydrate feed is still worth taking.
 *
 * Gastric emptying plus absorption is about a quarter of an hour; anything
 * swallowed inside that window is carried to the line rather than used.
 */
const LAST_USEFUL_FEED_MIN = 15;

/** How much the doses lean forward: first feed vs last, before normalising. */
const FRONT_LOAD_START = 1.15;
const FRONT_LOAD_END = 0.85;

const wantsCaffeine = (input: AthleteInput) =>
  Boolean(input.caffeineOk) && (input.durationMin >= 90 || input.intensity === "race" || input.intensity === "hard");

/** Format minutes as H:MM (or M:SS-style M min for sub-hour). */
export function formatClock(min: number): string {
  const m = Math.round(min);
  const h = Math.floor(m / 60);
  const mm = m % 60;
  return h > 0 ? `${h}:${String(mm).padStart(2, "0")}` : `0:${String(mm).padStart(2, "0")}`;
}

/** Build a timed fuelling schedule for a session. */
export function buildSchedule(input: AthleteInput, opts: ScheduleOptions = {}): FuellingSchedule {
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

  /**
   * Carbohydrate hits — deliberately not an even drip.
   *
   * The schedule used to place an identical dose at an identical interval right
   * up to the finish, which is wrong at both ends.
   *
   * **The last feeds never arrive.** Carbohydrate takes roughly a quarter of an
   * hour to clear the stomach and reach the blood, so a gel at minute 235 of a
   * four-hour run is swallowed, carried, and finished with — it does nothing
   * except sit there. Feeding stops early enough to be used, and its grams are
   * redistributed rather than dropped, so the athlete still gets the total the
   * target asks for.
   *
   * **Early grams are worth more than late ones.** A gram that spares glycogen
   * at minute 30 is a gram still in the tank at minute 200, and the gut takes
   * food better before it has been jostled for hours. So the doses lean forward
   * gently — enough to matter, not so much that it front-loads the whole plan
   * into one uncomfortable hour.
   */
  if (target.carbPerHourG > 0) {
    const times: number[] = [];
    for (let t = carbEvery; t <= totalMin - LAST_USEFUL_FEED_MIN; t += carbEvery) times.push(t);
    // A session too short for any feed to land is a session that runs on its
    // own stores, and saying so beats handing out a gel for the bin.
    if (times.length > 0) {
      const weights = times.map((t) => FRONT_LOAD_START - (FRONT_LOAD_START - FRONT_LOAD_END) * (t / totalMin));
      const weightSum = weights.reduce((s, w) => s + w, 0);
      const totalCarbG = (target.carbPerHourG * totalMin) / 60;
      times.forEach((t, i) => {
        bump(t, { carbG: Math.max(5, round5((totalCarbG * weights[i]) / weightSum)) });
      });
    }
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

  const cues: FuellingCue[] = [];
  cues.push({
    atMin: 0,
    kind: "start",
    label: "Start topped up — sip ~5–7 ml/kg fluid in the 2 h before.",
    parts: [{ kind: "startTopUp" }],
  });

  for (const [atMin, a] of [...acc.entries()].sort((x, y) => x[0] - y[0])) {
    const words: string[] = [];
    const parts: CuePart[] = [];
    if (a.carbG) {
      words.push(`${a.carbG} g carb`);
      parts.push({ kind: "carb", grams: a.carbG });
    }
    if (a.fluidMl) {
      words.push(`${a.fluidMl} ml`);
      parts.push({ kind: "fluid", millilitres: a.fluidMl });
    }
    if (a.caffeine) {
      words.push("caffeine");
      parts.push({ kind: "caffeine" });
    }
    const kind: CueKind = a.carbG ? "carb" : a.caffeine && !a.fluidMl ? "caffeine" : "drink";
    cues.push({ atMin, kind, ...a, label: words.join(" + "), parts });
  }

  cues.push({
    atMin: totalMin,
    kind: "finish",
    label: "Finish — start recovery (carb + protein) within ~60 min.",
    parts: [{ kind: "finishRecovery" }],
  });

  return {
    totalMin,
    cues,
    totalCarbG: [...acc.values()].reduce((s, a) => s + (a.carbG ?? 0), 0),
    totalFluidMl: [...acc.values()].reduce((s, a) => s + (a.fluidMl ?? 0), 0),
  };
}
