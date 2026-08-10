/**
 * Carbohydrate-availability model — the data behind the "energy profile" strip
 * (the Tesla trip-planner analogue: projected charge vs. distance, here glycogen
 * vs. time). It contrasts two curves: how the athlete's usable carbohydrate store
 * drains **unfuelled** (heading for the fade/bonk) versus **with the planned
 * intake**, which offsets the burn and keeps the tank above the line.
 *
 * It is deliberately a transparent illustration — population estimates of
 * glycogen storage and carbohydrate oxidation, not a measurement of this
 * athlete's metabolism. It exists to make "why fuel, and how much further it gets
 * you" visible, in line with the platform's explainability goal.
 *
 * **It used to be two straight lines.** Burn was a constant, intake was a
 * constant subtracted from it, so both curves were `store − rate × minutes` and
 * nothing that happened during the session could change their shape. The feed
 * pins along the top of the chart floated above a picture they had no effect
 * on — you could move every gel and the curve would not move. Four things fix
 * that, and each is a real effect rather than decoration:
 *
 * 1. **Feeds are events, not a drip.** A gel is swallowed at a minute and
 *    reaches the blood over the following quarter of an hour. Between feeds
 *    nothing arrives and the curve falls; after one it lifts. That sawtooth
 *    *is* the effect, and it is why moving a feed changes the picture.
 * 2. **The gut has a ceiling.** Intake beyond roughly 60 g/h (glucose alone) or
 *    90 g/h (with fructose) does not reach the muscle — it stays in the
 *    stomach. Modelling intake as a straight subtraction let a 105 g/h plan
 *    offset 105 g/h of burn, which is not what happens to the athlete.
 * 3. **Burn is not constant.** As the store empties the athlete shifts to fat
 *    and slows, so carbohydrate oxidation falls with it — which is what the
 *    wall actually looks like: the unfuelled curve flattens as it approaches
 *    empty rather than driving through the floor.
 * 4. **Effort is not sustainable indefinitely.** "Race" intensity means
 *    something different over 40 minutes and over 13 hours, and a flat rate
 *    per intensity had a 14-hour Ironman burning at one-hour race pace.
 *
 * The burn rate now comes from `carbBurnPerHourG` — the same function the race
 * simulation uses — instead of a second table that quietly disagreed with it.
 */
import { carbBurnPerHourG, GLUCOSE_ONLY_CEILING_G_PER_H, MULTI_TRANSPORTABLE_CEILING_G_PER_H } from "./oxidation";
import { formatClock } from "./schedule";
import type { FuellingSchedule } from "./schedule";
import type { AthleteInput, FuellingTarget } from "./types";

export interface EnergySample {
  /** Minutes from the start. */
  minute: number;
  /** Carbohydrate remaining with the plan, as % of the usable store. */
  fuelledPct: number;
  /** Carbohydrate remaining on water only, as % of the usable store. */
  unfuelledPct: number;
  /** What the gut is actually delivering right now, g/h — not what the plan asks. */
  deliveredPerHourG: number;
  /** What is being oxidised right now, g/h. Falls as the tank empties. */
  burnPerHourG: number;
}

export interface EnergyProfile {
  /** Usable carbohydrate store in grams (muscle + liver glycogen). */
  storeG: number;
  /** Carbohydrate oxidation rate at the start of the session, g/h. */
  burnPerHourG: number;
  /** Planned carbohydrate intake, g/h. */
  intakePerHourG: number;
  /** The most the gut can deliver, g/h, given the plan's sugar mix. */
  absorbCeilingPerHourG: number;
  /** Carbohydrate the plan asks the athlete to swallow, total grams. */
  plannedTotalG: number;
  /** Of that, what actually reaches the blood — the rest never arrives. */
  deliveredTotalG: number;
  durationMin: number;
  /** Below this % of the store, performance drops sharply — the "fade line". */
  bonkPct: number;
  samples: EnergySample[];
  /** Store remaining at the finish, each scenario. */
  fuelledEndPct: number;
  unfuelledEndPct: number;
  /** Minute the unfuelled curve crosses the fade line, if within the session. */
  unfuelledFadeMin?: number;
  /** Minute the *fuelled* curve crosses it, when even the plan is not enough. */
  fuelledFadeMin?: number;
  /** Plain-language takeaway. */
  headline: string;
  headlineId: EnergyHeadlineId;
}

const clampPct = (n: number): number => Math.max(0, Math.min(100, n));

/**
 * How much of a one-hour effort is still sustainable over a longer session.
 *
 * A power law, the same shape used for pace decay elsewhere: roughly 8 % off
 * per doubling of duration beyond an hour. It is a coarse stand-in for the
 * critical-power curve, not a measurement — but it is the difference between
 * modelling a 14-hour Ironman at one-hour race pace and modelling it at
 * something an athlete could actually hold.
 */
export function sustainableFraction(durationMin: number): number {
  const hours = Math.max(0.25, durationMin / 60);
  if (hours <= 1) return 1;
  return Math.max(0.55, Math.pow(hours, -0.12));
}

/**
 * How carbohydrate oxidation falls as the store empties.
 *
 * Above about 40 % of the store the athlete fuels normally. Below it they shift
 * to fat and slow down, and carbohydrate use falls with them — bottoming out
 * near 40 % of the fresh rate. This is what makes the unfuelled curve bend
 * instead of running straight into the floor, and it is why "the wall" is a
 * slowing rather than a stopping.
 */
export function substrateFactor(availabilityFrac: number): number {
  const shiftBelow = 0.4;
  if (availabilityFrac >= shiftBelow) return 1;
  return 0.4 + 0.6 * Math.max(0, availabilityFrac / shiftBelow);
}

/** Minutes between swallowing carbohydrate and it reaching the blood. */
const GASTRIC_LAG_MIN = 5;
/** Minutes over which one feed is absorbed, once it starts arriving. */
const ABSORB_WINDOW_MIN = 15;

/** A feed the athlete actually takes: when, and how much. */
interface Feed {
  atMin: number;
  carbG: number;
}

/**
 * Read the feeds out of the schedule.
 *
 * Falls back to an even drip at the target rate when no schedule is given, so
 * older callers keep working — but a caller that passes the schedule gets the
 * plan it is actually showing the athlete, which is the point.
 */
function feedsFrom(schedule: FuellingSchedule | undefined, target: FuellingTarget, durationMin: number): Feed[] {
  if (schedule) {
    return schedule.cues
      .filter((c): c is typeof c & { carbG: number } => (c.carbG ?? 0) > 0 && c.atMin <= durationMin)
      .map((c) => ({ atMin: c.atMin, carbG: c.carbG }));
  }
  if (target.carbPerHourG <= 0) return [];
  const every = 20;
  const out: Feed[] = [];
  for (let t = every; t < durationMin; t += every) {
    out.push({ atMin: t, carbG: (target.carbPerHourG * every) / 60 });
  }
  return out;
}

/**
 * Build the carbohydrate-availability profile for a session. Pure and
 * framework-free; the SVG strip and any tests read from it.
 */
export function energyProfile(
  input: AthleteInput,
  target: FuellingTarget,
  schedule?: FuellingSchedule,
): EnergyProfile {
  const durationMin = Math.max(1, Math.round(input.durationMin));
  // Usable endurance glycogen ≈ 6.5 g/kg (muscle + liver), scaled by body mass.
  const storeG = Math.round(input.bodyWeightKg * 6.5);
  const bonkPct = 18;

  // One burn model, shared with the race simulation, discounted for how long
  // the effort actually has to be held.
  const freshBurnPerHourG = carbBurnPerHourG(input.bodyWeightKg, input.intensity) * sustainableFraction(durationMin);
  const intakePerHourG = target.carbPerHourG;
  // A plan above 60 g/h is built from mixed sugars by the recommender, which is
  // exactly when the second transporter is available.
  const absorbCeilingPerHourG = target.requiresMultiTransportable
    ? MULTI_TRANSPORTABLE_CEILING_G_PER_H
    : GLUCOSE_ONLY_CEILING_G_PER_H;

  const feeds = feedsFrom(schedule, target, durationMin);
  const plannedTotalG = Math.round(feeds.reduce((s, f) => s + f.carbG, 0));

  // Per-minute walk. Two tanks, one gut.
  let fuelled = storeG;
  let unfuelled = storeG;
  let gutPoolG = 0;
  let deliveredTotalG = 0;
  let unfuelledFadeMin: number | undefined;
  let fuelledFadeMin: number | undefined;

  // Sampled down to keep the series drawable; the walk itself stays per-minute
  // so a feed is never stepped over.
  const step = Math.max(1, Math.ceil(durationMin / 240));
  const samples: EnergySample[] = [];

  const burnAt = (tank: number) => (freshBurnPerHourG * substrateFactor(tank / storeG)) / 60;

  const record = (minute: number, deliveredPerMin: number, burnPerMin: number) => {
    samples.push({
      minute,
      fuelledPct: clampPct((fuelled / storeG) * 100),
      unfuelledPct: clampPct((unfuelled / storeG) * 100),
      deliveredPerHourG: Math.round(deliveredPerMin * 60),
      burnPerHourG: Math.round(burnPerMin * 60),
    });
  };

  record(0, 0, burnAt(fuelled));

  for (let m = 1; m <= durationMin; m++) {
    // What was swallowed in this minute joins the gut pool. It leaves the pool
    // no faster than the transporters allow, so over-feeding shows up as a
    // plateau at the ceiling and a backlog — which is what it feels like.
    for (const f of feeds) {
      const start = f.atMin + GASTRIC_LAG_MIN;
      if (m > start && m <= start + ABSORB_WINDOW_MIN) gutPoolG += f.carbG / ABSORB_WINDOW_MIN;
    }
    const deliveredPerMin = Math.min(gutPoolG, absorbCeilingPerHourG / 60);
    gutPoolG -= deliveredPerMin;
    deliveredTotalG += deliveredPerMin;

    const burnFuelledPerMin = burnAt(fuelled);
    const burnUnfuelledPerMin = burnAt(unfuelled);
    fuelled = Math.max(0, Math.min(storeG, fuelled + deliveredPerMin - burnFuelledPerMin));
    unfuelled = Math.max(0, unfuelled - burnUnfuelledPerMin);

    if (unfuelledFadeMin === undefined && unfuelled / storeG <= bonkPct / 100) unfuelledFadeMin = m;
    if (fuelledFadeMin === undefined && fuelled / storeG <= bonkPct / 100) fuelledFadeMin = m;

    if (m % step === 0 || m === durationMin) record(m, deliveredPerMin, burnFuelledPerMin);
  }

  const fuelledEndPct = Math.round(clampPct((fuelled / storeG) * 100));
  const unfuelledEndPct = Math.round(clampPct((unfuelled / storeG) * 100));

  const built = buildHeadline({
    durationMin,
    intakePerHourG,
    bonkPct,
    fuelledEndPct,
    unfuelledEndPct,
    unfuelledFadeMin,
    fuelledFadeMin,
  });

  return {
    storeG,
    burnPerHourG: Math.round(freshBurnPerHourG),
    intakePerHourG,
    absorbCeilingPerHourG,
    plannedTotalG,
    deliveredTotalG: Math.round(deliveredTotalG),
    durationMin,
    bonkPct,
    samples,
    fuelledEndPct,
    unfuelledEndPct,
    ...(unfuelledFadeMin !== undefined ? { unfuelledFadeMin } : {}),
    ...(fuelledFadeMin !== undefined ? { fuelledFadeMin } : {}),
    headline: built.text,
    headlineId: built.id,
  };
}

/** Which sentence the chart is showing, so a UI can write it in its own language. */
export type EnergyHeadlineId =
  | "waterDips"
  | "waterFine"
  | "planSavesFade"
  | "planFinishesFresher"
  | "planNotEnough";

function buildHeadline(p: {
  durationMin: number;
  intakePerHourG: number;
  bonkPct: number;
  fuelledEndPct: number;
  unfuelledEndPct: number;
  unfuelledFadeMin?: number;
  fuelledFadeMin?: number;
}): { id: EnergyHeadlineId; text: string } {
  if (p.intakePerHourG === 0) {
    return p.unfuelledEndPct <= p.bonkPct
      ? { id: "waterDips", text: "Even this session dips toward the fade line — but it's short and easy enough that water is the sensible call." }
      : { id: "waterFine", text: "Short and easy enough to run on your own stores — fuel here is about comfort, not avoiding a fade." };
  }
  // The honest case the old model could not produce: a session long enough that
  // even a maximal, fully-absorbed plan runs the tank down.
  if (p.fuelledFadeMin !== undefined) {
    return {
      id: "planNotEnough",
      text: `Even fuelled, the tank reaches the fade line around ${formatClock(p.fuelledFadeMin)} — no gut absorbs this much. Go easier early, or plan to slow.`,
    };
  }
  if (p.unfuelledFadeMin !== undefined) {
    return {
      id: "planSavesFade",
      text: `On water alone you'd hit the fade line around ${formatClock(p.unfuelledFadeMin)} — the plan keeps you above it to the finish with ~${p.fuelledEndPct}% in reserve.`,
    };
  }
  return {
    id: "planFinishesFresher",
    text: `You'd finish either way, but the plan lands you at ~${p.fuelledEndPct}% vs ~${p.unfuelledEndPct}% — fresher legs and a faster recovery.`,
  };
}
