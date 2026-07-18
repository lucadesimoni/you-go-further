import { describe, expect, it } from "vitest";
import {
  PLANS,
  TIER_ORDER,
  assertFeature,
  can,
  FeatureLockedError,
  limit,
  requiredTierFor,
} from "./plans";

describe("subscription plans", () => {
  it("monotonically unlocks provider slots and history as tiers rise", () => {
    for (let i = 1; i < TIER_ORDER.length; i++) {
      const lower = TIER_ORDER[i - 1];
      const higher = TIER_ORDER[i];
      expect(limit(higher, "maxConnectedProviders")).toBeGreaterThanOrEqual(limit(lower, "maxConnectedProviders"));
      expect(limit(higher, "historyDays")).toBeGreaterThanOrEqual(limit(lower, "historyDays"));
    }
  });

  it("gates premium features to paid tiers", () => {
    expect(can("free", "loadAnalytics")).toBe(false);
    expect(can("pro", "loadAnalytics")).toBe(true);
    expect(can("free", "dataExport")).toBe(false);
    expect(can("pro", "dataExport")).toBe(false);
    expect(can("elite", "dataExport")).toBe(true);
    expect(can("elite", "aiInsights")).toBe(true);
  });

  it("reports the cheapest tier that unlocks a feature", () => {
    expect(requiredTierFor("loadAnalytics")).toBe("pro");
    expect(requiredTierFor("dataExport")).toBe("elite");
    expect(requiredTierFor("autoSync")).toBe("pro");
  });

  it("assertFeature throws a FeatureLockedError with the upgrade target", () => {
    expect(() => assertFeature("free", "dataExport")).toThrowError(FeatureLockedError);
    try {
      assertFeature("free", "dataExport");
    } catch (e) {
      expect(e).toBeInstanceOf(FeatureLockedError);
      expect((e as FeatureLockedError).requiredTier).toBe("elite");
    }
    expect(() => assertFeature("elite", "dataExport")).not.toThrow();
  });

  it("prices increase with tier", () => {
    expect(PLANS.free.priceChfPerMonth).toBe(0);
    expect(PLANS.pro.priceChfPerMonth).toBeGreaterThan(PLANS.free.priceChfPerMonth);
    expect(PLANS.elite.priceChfPerMonth).toBeGreaterThan(PLANS.pro.priceChfPerMonth);
  });
});
