import type { SessionFeedback } from "../feedback";

/**
 * Fuelling score — progress toward *fuelling well*, not toward pressing buttons.
 *
 * It scores the things that decide whether a session goes well: did you finish
 * with energy, did your gut cope, are the long sessions actually fuelled, and is
 * the plan personalised to you. Every component comes with a plain reason, and
 * the score always ends with the single most useful next action — the point is
 * to tell an athlete what to change, not to nag them into a streak.
 */
export interface ScoreComponent {
  id: string;
  label: string;
  /** 0–100 for this component. */
  score: number;
  /** How much it counts toward the overall score. */
  weight: number;
  /** Plain-language reading of the number. */
  detail: string;
}

export interface NextAction {
  title: string;
  why: string;
}

export type ScoreBand = "getting-started" | "building" | "solid" | "dialled-in";

export interface FuellingScore {
  /** 0–100, or null until there is enough logged data to be honest about it. */
  score: number | null;
  band: ScoreBand;
  components: ScoreComponent[];
  /** Ranked, concrete things to do next — the useful part. */
  nextActions: NextAction[];
  /** Health-first warnings that outrank performance advice. */
  healthFlags: string[];
  /** Movement over the athlete's recent history. */
  trend: { direction: "up" | "flat" | "down"; delta: number } | null;
  /** How much data the score rests on. */
  sessionsLogged: number;
}

export interface FuellingScoreInput {
  feedback: SessionFeedback[];
  /** Sessions of 90 min+ in the recent window — the ones that need carbs. */
  longSessions: number;
  connectionsCount: number;
  hasMeasuredSweatRate: boolean;
}

const ENERGY_POINTS: Record<SessionFeedback["energy"], number> = {
  strong: 100,
  steady: 85,
  faded: 45,
  bonked: 10,
};

const GI_POINTS: Record<SessionFeedback["gi"], number> = {
  none: 100,
  mild: 65,
  severe: 15,
};

const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
const round = (n: number) => Math.round(n);

function bandFor(score: number, logged: number): ScoreBand {
  if (logged < 3) return "getting-started";
  if (score >= 85) return "dialled-in";
  if (score >= 65) return "solid";
  return "building";
}

/** Score how well this athlete is fuelling, and what to improve next. */
export function fuellingScore(input: FuellingScoreInput): FuellingScore {
  const { feedback, longSessions, connectionsCount, hasMeasuredSweatRate } = input;
  const recent = [...feedback].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 10);
  const logged = feedback.length;

  const energyScore = recent.length ? mean(recent.map((f) => ENERGY_POINTS[f.energy])) : 0;
  const gutScore = recent.length ? mean(recent.map((f) => GI_POINTS[f.gi])) : 0;

  // Are the sessions that actually need fuel being fuelled and reviewed?
  const fuelledLong = recent.filter((f) => f.durationMin >= 90 && f.plannedCarbPerHourG > 0).length;
  const coverage = longSessions > 0 ? Math.min(1, fuelledLong / Math.min(longSessions, 5)) * 100 : recent.length ? 70 : 0;

  // How well the plan is tailored: real data in, body signals measured.
  const personalisation =
    (connectionsCount > 0 ? 45 : 0) + (hasMeasuredSweatRate ? 35 : 0) + Math.min(20, logged * 4);

  const components: ScoreComponent[] = [
    {
      id: "energy",
      label: "Finishing with energy",
      score: round(energyScore),
      weight: 0.35,
      detail: recent.length
        ? energyScore >= 85
          ? "You're finishing sessions strong — carbohydrate is matching the work."
          : energyScore >= 60
            ? "Mostly steady, with some fading — there's room to fuel earlier and a little more."
            : "You're running out of fuel. Carbohydrate intake is below what these sessions demand."
        : "Log a session to start scoring this.",
    },
    {
      id: "gut",
      label: "Gut tolerance",
      score: round(gutScore),
      weight: 0.3,
      detail: recent.length
        ? gutScore >= 85
          ? "No distress — your gut is handling the intake you're taking in."
          : gutScore >= 60
            ? "Occasional discomfort. Split feeds smaller and check your drink isn't too concentrated."
            : "Your gut is the limiter right now, not your legs. Ease the rate and rebuild it."
        : "Log a session to start scoring this.",
    },
    {
      id: "coverage",
      label: "Fuelling the long ones",
      score: round(coverage),
      weight: 0.2,
      detail:
        longSessions === 0
          ? "No 90 min+ sessions recently — carbohydrate matters most once you pass that."
          : fuelledLong > 0
            ? `${fuelledLong} of your recent long sessions were fuelled to a plan.`
            : "Your long sessions aren't being fuelled to a plan — that's where the biggest gains are.",
    },
    {
      id: "personalisation",
      label: "Plan tailored to you",
      score: round(Math.min(100, personalisation)),
      weight: 0.15,
      detail: hasMeasuredSweatRate
        ? "Using your measured sweat data and your own sessions."
        : connectionsCount > 0
          ? "Using your real sessions, but hydration is still a population estimate."
          : "Nothing connected yet — the plan is working from averages, not from you.",
    },
  ];

  const overall = logged === 0 ? null : round(components.reduce((s, c) => s + c.score * c.weight, 0));

  // --- Health first -------------------------------------------------------
  const healthFlags: string[] = [];
  const lastFive = recent.slice(0, 5);
  const bonks = lastFive.filter((f) => f.energy === "bonked").length;
  if (bonks >= 2) {
    healthFlags.push(
      "You've bonked in several recent sessions. Repeatedly training under-fuelled affects hormones, bone and immunity, not just performance — read 'Low energy availability' and consider raising daily carbohydrate.",
    );
  }
  if (lastFive.filter((f) => f.gi === "severe").length >= 2) {
    healthFlags.push(
      "Severe gut distress more than once. Drop back to a rate you tolerate and rebuild gradually; persistent symptoms are worth discussing with a sports dietitian.",
    );
  }

  // --- What to actually do next ------------------------------------------
  const nextActions: NextAction[] = [];
  if (logged === 0) {
    nextActions.push({
      title: "Log your next session",
      why: "One log tells the planner how the fuelling felt — it's what everything else here learns from.",
    });
  }
  if (gutScore > 0 && gutScore < 65) {
    nextActions.push({
      title: "Lower your carb rate ~10 g/h and rebuild",
      why: "Gut distress is limiting you. The engine has already capped your ceiling; rebuild in small steps over a few weeks.",
    });
  }
  if (energyScore > 0 && energyScore < 70 && gutScore >= 65) {
    nextActions.push({
      title: "Add ~10 g/h of carbohydrate on sessions over 90 minutes",
      why: "You're fading with a settled gut — the clearest sign there's headroom to fuel more.",
    });
  }
  if (!hasMeasuredSweatRate) {
    nextActions.push({
      title: "Measure your sweat rate once",
      why: "It takes one 90-minute session and replaces a population estimate with your own number for fluid and sodium.",
    });
  }
  if (connectionsCount === 0) {
    nextActions.push({
      title: "Connect your training service",
      why: "Plans then use your real sessions and terrain instead of what you type in.",
    });
  }
  if (logged > 0 && logged < 5) {
    nextActions.push({
      title: `Log ${5 - logged} more session${5 - logged === 1 ? "" : "s"}`,
      why: "At five, the engine starts adapting your carb target to your own gut and energy.",
    });
  }
  if (nextActions.length === 0) {
    nextActions.push({
      title: "Rehearse race fuelling on your next long session",
      why: "Your fuelling is working. The remaining gain is practising it at race rate so nothing is new on the day.",
    });
  }

  // --- Trend --------------------------------------------------------------
  let trend: FuellingScore["trend"] = null;
  if (recent.length >= 6) {
    const composite = (f: SessionFeedback) => ENERGY_POINTS[f.energy] * 0.6 + GI_POINTS[f.gi] * 0.4;
    const newer = mean(recent.slice(0, 3).map(composite));
    const older = mean(recent.slice(3, 6).map(composite));
    const delta = round(newer - older);
    trend = { delta, direction: delta > 5 ? "up" : delta < -5 ? "down" : "flat" };
  }

  return {
    score: overall,
    band: bandFor(overall ?? 0, logged),
    components,
    nextActions: nextActions.slice(0, 3),
    healthFlags,
    trend,
    sessionsLogged: logged,
  };
}

export const BAND_LABEL: Record<ScoreBand, string> = {
  "getting-started": "Getting started",
  building: "Building",
  solid: "Solid",
  "dialled-in": "Dialled in",
};
