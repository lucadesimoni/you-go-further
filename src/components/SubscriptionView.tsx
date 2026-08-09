import { useState } from "react";
import { PLANS, TIER_ORDER, type Tier } from "../subscription";
import { toast } from "../ui/toast";
import { api, isApiConfigured } from "../api/client";
import { useT, type TranslationKey } from "../i18n";

const FEATURE_ROWS: { key: keyof (typeof PLANS)["free"]["features"]; label: TranslationKey }[] = [
  { key: "maxConnectedProviders", label: "feature.connectedServices" },
  { key: "historyDays", label: "feature.historyDays" },
  { key: "autoSync", label: "feature.autoSync" },
  { key: "loadAnalytics", label: "feature.loadAnalytics" },
  { key: "dataExport", label: "feature.dataExport" },
  { key: "aiInsights", label: "feature.aiInsights" },
];
const cell = (v: unknown) => (typeof v === "boolean" ? (v ? "✓" : "—") : String(v));

/** Subscription & billing — plan selection for owners, read-only for org seats. */
export function SubscriptionView({
  tier,
  onChoose,
  canBilling,
}: {
  tier: Tier;
  onChoose: (t: Tier) => void;
  canBilling: boolean;
}) {
  const t = useT();
  const [busy, setBusy] = useState<Tier | null>(null);
  const live = isApiConfigured();

  // Paid plans go through the payment provider; the tier only moves once the
  // signed webhook confirms payment. Free (and the client-only build) switch directly.
  const choose = async (next: Tier) => {
    if (!live || PLANS[next].priceChfPerMonth <= 0) {
      onChoose(next);
      toast.success(t("sub.switched", { plan: PLANS[next].name }));
      return;
    }
    setBusy(next);
    try {
      const res = await api.checkoutSubscription(next, window.location.href);
      window.location.href = res.url;
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not start checkout");
      setBusy(null);
    }
  };

  return (
    <main className="dash">
      <section className="panel">
        <div className="section-head">
          <h2>{t("sub.title")}</h2>
          <span className="pill">Current: {PLANS[tier].name}</span>
        </div>
        <p className="detail">
          {canBilling
            ? "Choose the plan that fits your training. Change any time — features unlock immediately."
            : "Your plan is managed by your organization."}
        </p>

        <div className="plan-cards">
          {TIER_ORDER.map((tierId) => {
            const plan = PLANS[tierId];
            const current = tierId === tier;
            return (
              <div key={tierId} className={`plan-card${current ? " active" : ""}`}>
                <div className="plan-card-head">
                  <span className="plan-card-name">
                    {plan.name}
                    {current && <span className="plan-card-badge">current</span>}
                  </span>
                  <span className="plan-card-price">
                    {plan.priceChfPerMonth === 0 ? "Free" : `CHF ${plan.priceChfPerMonth}/mo`}
                  </span>
                </div>
                <p className="plan-card-tag">{plan.tagline}</p>
                <ul className="plan-card-feats">
                  {FEATURE_ROWS.map((row) => (
                    <li key={row.key}>
                      <span>{t(row.label)}</span>
                      <span>{cell(plan.features[row.key])}</span>
                    </li>
                  ))}
                </ul>
                {canBilling && (
                  <button
                    type="button"
                    className={`btn ${current ? "btn-ghost" : "btn-primary"} plan-card-btn`}
                    onClick={() => choose(tierId)}
                    disabled={current || busy !== null}
                  >
                    {current
                      ? "Current plan"
                      : busy === tierId
                        ? "Starting checkout…"
                        : plan.priceChfPerMonth === 0
                          ? "Downgrade"
                          : `Choose ${plan.name}`}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </section>
    </main>
  );
}
