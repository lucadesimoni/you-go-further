/**
 * Subscription ("Abo") tiers and feature gating.
 *
 * Feature access is data-driven: every gated capability is a field on
 * {@link PlanFeatures}, so the UI and the pipeline check the same source of
 * truth via {@link can} / {@link limit}.
 */

export type Tier = "free" | "pro" | "elite";

export type AnalysisDepth = "basic" | "advanced";

export interface PlanFeatures {
  /** How many device/service accounts can be connected at once. */
  maxConnectedProviders: number;
  /** How far back history is retained/queryable, in days. */
  historyDays: number;
  /** Automatic background sync vs. manual refresh only. */
  autoSync: boolean;
  analysisDepth: AnalysisDepth;
  /** Acute:chronic load & injury-risk analytics. */
  loadAnalytics: boolean;
  /** Raw data export to warehouse / NDJSON / CSV. */
  dataExport: boolean;
  /** AI-generated training & fueling insights. */
  aiInsights: boolean;
}

export interface Plan {
  tier: Tier;
  name: string;
  priceChfPerMonth: number;
  /** Marketing one-liner. */
  tagline: string;
  features: PlanFeatures;
}

export const PLANS: Record<Tier, Plan> = {
  free: {
    tier: "free",
    name: "Base",
    priceChfPerMonth: 0,
    tagline: "Connect one service and get your fueling plan.",
    features: {
      maxConnectedProviders: 1,
      historyDays: 30,
      autoSync: false,
      analysisDepth: "basic",
      loadAnalytics: false,
      dataExport: false,
      aiInsights: false,
    },
  },
  pro: {
    tier: "pro",
    name: "Pro",
    priceChfPerMonth: 9,
    tagline: "All devices, a full season of history, load analytics.",
    features: {
      maxConnectedProviders: 4,
      historyDays: 365,
      autoSync: true,
      analysisDepth: "advanced",
      loadAnalytics: true,
      dataExport: false,
      aiInsights: false,
    },
  },
  elite: {
    tier: "elite",
    name: "Elite",
    priceChfPerMonth: 19,
    tagline: "Everything in Pro, plus data export and AI insights.",
    features: {
      maxConnectedProviders: 4,
      historyDays: 1825,
      autoSync: true,
      analysisDepth: "advanced",
      loadAnalytics: true,
      dataExport: true,
      aiInsights: true,
    },
  },
};

export const TIER_ORDER: Tier[] = ["free", "pro", "elite"];

/** Boolean feature check for a tier. */
export function can(tier: Tier, feature: keyof PlanFeatures): boolean {
  return Boolean(PLANS[tier].features[feature]);
}

/** Numeric limit for a tier (e.g. `maxConnectedProviders`, `historyDays`). */
export function limit(tier: Tier, feature: "maxConnectedProviders" | "historyDays"): number {
  return PLANS[tier].features[feature];
}

/** The cheapest tier that unlocks a given boolean feature, if any. */
export function requiredTierFor(feature: keyof PlanFeatures): Tier | undefined {
  return TIER_ORDER.find((t) => Boolean(PLANS[t].features[feature]));
}

export class FeatureLockedError extends Error {
  constructor(
    public readonly feature: keyof PlanFeatures,
    public readonly currentTier: Tier,
    public readonly requiredTier?: Tier,
  ) {
    super(
      `Feature "${String(feature)}" is not available on the ${PLANS[currentTier].name} plan` +
        (requiredTier ? `; upgrade to ${PLANS[requiredTier].name}.` : "."),
    );
    this.name = "FeatureLockedError";
  }
}

/** Throw unless the tier unlocks the boolean feature. */
export function assertFeature(tier: Tier, feature: keyof PlanFeatures): void {
  if (!can(tier, feature)) throw new FeatureLockedError(feature, tier, requiredTierFor(feature));
}
