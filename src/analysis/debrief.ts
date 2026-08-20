import type { RouteFuelPlan } from "../engine";
import type { SessionFeedback } from "../feedback";

/**
 * The post-run debrief: what the session actually demanded, what the athlete
 * actually took, and where the gap was.
 *
 * This is the half of the loop that was missing. The platform already knew how
 * to work out what a route needed and where; it had no way to hold that against
 * what really happened, because logs weren't attached to sessions. With the two
 * joined, it can finally answer the only question an athlete asks after a bad
 * run: *what should I have done differently?*
 *
 * Everything here is conditional on evidence. No log means no verdict — an
 * invented one would be worse than silence, because the athlete would act on it.
 */

export type DebriefVerdict = "under-fuelled" | "about-right" | "over-gut" | "unknown";

export interface DebriefFinding {
  /** Stable id, so the UI can translate rather than print engine English. */
  id:
    | "underFuelled"
    | "aboutRight"
    | "gutLimited"
    | "startedLate"
    | "climbUnfuelled"
    | "noLog"
    | "shortSession";
  /** English text — the fallback, and what non-UI consumers get. */
  text: string;
  vars?: Record<string, string | number>;
}

export interface SessionDebrief {
  verdict: DebriefVerdict;
  /** Carb per hour the terrain and duration called for. */
  requiredCarbPerHourG: number;
  /** What the athlete reports taking, when they said. */
  actualCarbPerHourG?: number;
  /** Shortfall in g/h; positive means they were short. */
  gapPerHourG?: number;
  /** Total grams the route plan would have delivered. */
  plannedTotalG: number;
  findings: DebriefFinding[];
  /** True when there is a log to reason from at all. */
  hasLog: boolean;
}

const round = (n: number) => Math.round(n);

/**
 * Compare a session's fuelling requirement against what the athlete reports.
 *
 * `plan` is the terrain-aware plan for that session; `log` is the athlete's own
 * account of it. The verdict leans on what they *said* rather than what we
 * modelled — a report of bonking is evidence, our estimate is only a model.
 */
export function debriefSession(input: {
  /**
   * Optional, because a debrief describes a *session* and a route is extra
   * context. Without one the planned total is simply rate × time — which is
   * what a plan for a session with no track amounts to anyway — and the two
   * findings that talk about terrain stay silent, correctly: there is nothing
   * to say about a climb nobody recorded.
   *
   * This is what let the debrief out of the route view. While it was required,
   * an athlete who runs without GPS could not rate a session at all.
   */
  plan?: RouteFuelPlan;
  requiredCarbPerHourG: number;
  log?: SessionFeedback;
  durationMin: number;
}): SessionDebrief {
  const { plan, requiredCarbPerHourG, log, durationMin } = input;
  const findings: DebriefFinding[] = [];
  const plannedTotalG = plan ? plan.totalCarbG : Math.round((requiredCarbPerHourG * durationMin) / 60);

  if (durationMin < 60) {
    findings.push({
      id: "shortSession",
      text: "Under an hour — carbohydrate during the session isn't what decided how this felt.",
    });
  }

  if (!log) {
    findings.push({
      id: "noLog",
      text: "Tell us how this one went and we can show you exactly where the fuelling fell short.",
    });
    return {
      verdict: "unknown",
      requiredCarbPerHourG: round(requiredCarbPerHourG),
      plannedTotalG,
      findings,
      hasLog: false,
    };
  }

  const actual = log.actualCarbPerHourG;
  const gap = actual === undefined ? undefined : round(requiredCarbPerHourG - actual);

  let verdict: DebriefVerdict = "about-right";

  // The gut is the first constraint: no amount of "eat more" helps if it was
  // already refusing what went in.
  if (log.gi === "severe") {
    verdict = "over-gut";
    findings.push({
      id: "gutLimited",
      text: "Your gut was the limiter here, not the amount. Drop the rate and rebuild it before adding more.",
    });
  } else if (actual !== undefined && gap !== undefined && gap >= 10) {
    verdict = "under-fuelled";
    findings.push({
      id: "underFuelled",
      text: `You took about ${actual} g/h; this route's climbing called for ${round(requiredCarbPerHourG)} g/h — roughly ${gap} g/h short.`,
      vars: { actual, required: round(requiredCarbPerHourG), gap },
    });
  } else if (log.energy === "bonked" || log.energy === "faded") {
    // Fading with a settled gut is itself evidence, even without a number.
    verdict = "under-fuelled";
    findings.push({
      id: "underFuelled",
      text: `You faded, and your gut was fine — this route asked for about ${round(requiredCarbPerHourG)} g/h.`,
      vars: { actual: actual ?? 0, required: round(requiredCarbPerHourG), gap: gap ?? 0 },
    });
  } else {
    findings.push({
      id: "aboutRight",
      text: "Fuelling matched what this route demanded — repeat it.",
    });
  }

  // Terrain-specific coaching: the biggest climb is where an under-fuelled
  // session actually comes apart, so name it.
  const bigClimb = [...(plan?.climbs ?? [])].sort((a, b) => b.gainM - a.gainM)[0];
  if (bigClimb && verdict === "under-fuelled") {
    findings.push({
      id: "climbUnfuelled",
      text: `The ${bigClimb.gainM} m climb from km ${bigClimb.fromKm} is where that gap bites — take carbohydrate on the approach next time.`,
      vars: { gain: bigClimb.gainM, km: bigClimb.fromKm },
    });
  }

  // Starting late is a distinct, very common error from simply taking too little.
  const firstStop = plan?.stops[0];
  if (firstStop && firstStop.atMin > 45 && verdict === "under-fuelled") {
    findings.push({
      id: "startedLate",
      text: `Start earlier, too: the first feed wants to be inside the first 30–40 minutes, not at ${firstStop.atMin}.`,
      vars: { atMin: firstStop.atMin },
    });
  }

  return {
    verdict,
    requiredCarbPerHourG: round(requiredCarbPerHourG),
    actualCarbPerHourG: actual,
    gapPerHourG: gap,
    plannedTotalG,
    findings,
    hasLog: true,
  };
}

/** The log that belongs to a given session, if the athlete recorded one. */
export function logForActivity(feedback: SessionFeedback[], activityId: string): SessionFeedback | undefined {
  return feedback.find((f) => f.activityId === activityId);
}
