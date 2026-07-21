/**
 * Carbohydrate-availability model — the data behind the "energy profile" strip
 * (the Tesla trip-planner analogue: projected charge vs. distance, here glycogen
 * vs. time). It contrasts two curves: how the athlete's usable carbohydrate store
 * drains **unfueled** (heading for the fade/bonk) versus **with the planned
 * intake**, which offsets the burn and keeps the tank above the line.
 *
 * It is deliberately a simple, transparent illustration — population estimates of
 * glycogen storage and carbohydrate oxidation, not a measurement of this
 * athlete's metabolism. It exists to make "why fuel, and how much further it gets
 * you" visible, in line with the platform's explainability goal.
 */
import { formatClock } from "./schedule";
import type { AthleteInput, FuelingTarget, Intensity } from "./types";

export interface EnergySample {
  /** Minutes from the start. */
  minute: number;
  /** Carbohydrate remaining with the plan, as % of the usable store. */
  fueledPct: number;
  /** Carbohydrate remaining on water only, as % of the usable store. */
  unfueledPct: number;
}

export interface EnergyProfile {
  /** Usable carbohydrate store in grams (muscle + liver glycogen). */
  storeG: number;
  /** Carbohydrate oxidation rate for the session, g/h. */
  burnPerHourG: number;
  /** Planned carbohydrate intake, g/h. */
  intakePerHourG: number;
  durationMin: number;
  /** Below this % of the store, performance drops sharply — the "fade line". */
  bonkPct: number;
  samples: EnergySample[];
  /** Store remaining at the finish, each scenario. */
  fueledEndPct: number;
  unfueledEndPct: number;
  /** Minute the unfueled curve crosses the fade line, if within the session. */
  unfueledFadeMin?: number;
  /** Plain-language takeaway. */
  headline: string;
}

/** Carbohydrate oxidation (g/h) by intensity — total burn from all sources. */
const BURN_BY_INTENSITY: Record<Intensity, number> = { easy: 50, moderate: 110, hard: 170, race: 200 };

const clampPct = (n: number): number => Math.max(0, Math.min(100, n));

/**
 * Build the carbohydrate-availability profile for a session. Pure and
 * framework-free; the SVG strip and any tests read from it.
 */
export function energyProfile(input: AthleteInput, target: FuelingTarget): EnergyProfile {
  const durationMin = Math.max(1, input.durationMin);
  // Usable endurance glycogen ≈ 6.5 g/kg (muscle + liver), scaled by body mass.
  const storeG = Math.round(input.bodyWeightKg * 6.5);
  // Heavier athletes burn a little more; race pace burns most.
  const burnPerHourG = Math.round(BURN_BY_INTENSITY[input.intensity] * (input.bodyWeightKg / 70));
  const intakePerHourG = target.carbPerHourG;
  const bonkPct = 18;

  const netUnfueled = burnPerHourG; // no intake
  const netFueled = Math.max(0, burnPerHourG - intakePerHourG);

  const remainingPct = (netPerHourG: number, minute: number): number =>
    clampPct(((storeG - (netPerHourG * minute) / 60) / storeG) * 100);

  const STEPS = 40;
  const samples: EnergySample[] = [];
  for (let i = 0; i <= STEPS; i++) {
    const minute = (durationMin * i) / STEPS;
    samples.push({
      minute,
      fueledPct: remainingPct(netFueled, minute),
      unfueledPct: remainingPct(netUnfueled, minute),
    });
  }

  const fueledEndPct = Math.round(remainingPct(netFueled, durationMin));
  const unfueledEndPct = Math.round(remainingPct(netUnfueled, durationMin));

  // When does water-only cross the fade line?
  const unfueledFadeMinRaw =
    netUnfueled > 0 ? ((storeG * (1 - bonkPct / 100)) / netUnfueled) * 60 : Infinity;
  const unfueledFadeMin =
    unfueledFadeMinRaw <= durationMin ? Math.round(unfueledFadeMinRaw) : undefined;

  const headline = buildHeadline({
    durationMin,
    intakePerHourG,
    bonkPct,
    fueledEndPct,
    unfueledEndPct,
    unfueledFadeMin,
  });

  return {
    storeG,
    burnPerHourG,
    intakePerHourG,
    durationMin,
    bonkPct,
    samples,
    fueledEndPct,
    unfueledEndPct,
    unfueledFadeMin,
    headline,
  };
}

function buildHeadline(p: {
  durationMin: number;
  intakePerHourG: number;
  bonkPct: number;
  fueledEndPct: number;
  unfueledEndPct: number;
  unfueledFadeMin?: number;
}): string {
  if (p.intakePerHourG === 0) {
    return p.unfueledEndPct <= p.bonkPct
      ? `Even this session dips toward the fade line — but it's short/easy enough that water is the sensible call.`
      : `Short and easy enough to run on your own stores — fuel here is about comfort, not avoiding a fade.`;
  }
  if (p.unfueledFadeMin !== undefined) {
    return `On water alone you'd hit the fade line around ${formatClock(
      p.unfueledFadeMin,
    )} — the plan keeps you above it to the finish with ~${p.fueledEndPct}% in reserve.`;
  }
  return `You'd finish either way, but the plan lands you at ~${p.fueledEndPct}% vs ~${p.unfueledEndPct}% — fresher legs and a faster recovery.`;
}
