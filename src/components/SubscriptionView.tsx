import { PLANS, TIER_ORDER, type Tier } from "../subscription";

const FEATURE_ROWS: { key: keyof (typeof PLANS)["free"]["features"]; label: string }[] = [
  { key: "maxConnectedProviders", label: "Connected services" },
  { key: "historyDays", label: "History (days)" },
  { key: "autoSync", label: "Auto-sync" },
  { key: "loadAnalytics", label: "Load analytics" },
  { key: "dataExport", label: "Data export" },
  { key: "aiInsights", label: "AI insights" },
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
  return (
    <main className="dash">
      <section className="panel">
        <div className="section-head">
          <h2>Subscription</h2>
          <span className="pill">Current: {PLANS[tier].name}</span>
        </div>
        <p className="detail">
          {canBilling
            ? "Choose the plan that fits your training. Change any time — features unlock immediately."
            : "Your plan is managed by your organization."}
        </p>

        <div className="plan-cards">
          {TIER_ORDER.map((t) => {
            const plan = PLANS[t];
            const current = t === tier;
            return (
              <div key={t} className={`plan-card${current ? " active" : ""}`}>
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
                      <span>{row.label}</span>
                      <span>{cell(plan.features[row.key])}</span>
                    </li>
                  ))}
                </ul>
                {canBilling && (
                  <button
                    type="button"
                    className={`btn ${current ? "btn-ghost" : "btn-primary"} plan-card-btn`}
                    disabled={current}
                    onClick={() => onChoose(t)}
                  >
                    {current ? "Current plan" : plan.priceChfPerMonth === 0 ? "Downgrade" : `Choose ${plan.name}`}
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
