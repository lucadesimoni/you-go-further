import { useState } from "react";
import { Planner } from "./components/Planner";
import { Dashboard } from "./components/Dashboard";
import { PLANS, TIER_ORDER, type Tier } from "./subscription";

type TabId = "plan" | "connect";

export function App() {
  const [tab, setTab] = useState<TabId>("plan");
  const [tier, setTier] = useState<Tier>("free");

  return (
    <div className="page">
      <header className="hero">
        <p className="kicker">You Go Further</p>
        <h1>Swiss endurance fueling, tuned to your training</h1>
        <p className="sub">
          Connect Strava, Garmin, Polar and Suunto, analyse your training load, and get before /
          during / after fueling with Swiss products from Sponser and Winforce.
        </p>
      </header>

      <div className="tierbar" role="group" aria-label="Subscription">
        {TIER_ORDER.map((t) => {
          const plan = PLANS[t];
          return (
            <button
              key={t}
              type="button"
              className={`tier${tier === t ? " active" : ""}`}
              onClick={() => setTier(t)}
            >
              <span className="tier-name">{plan.name}</span>
              <span className="tier-price">{plan.priceChfPerMonth === 0 ? "Free" : `CHF ${plan.priceChfPerMonth}/mo`}</span>
              <span className="tier-tag">{plan.tagline}</span>
            </button>
          );
        })}
      </div>

      <nav className="tabs" aria-label="Views">
        <button type="button" className={tab === "plan" ? "tab active" : "tab"} onClick={() => setTab("plan")}>
          Fuel planner
        </button>
        <button type="button" className={tab === "connect" ? "tab active" : "tab"} onClick={() => setTab("connect")}>
          Connect &amp; analyse
        </button>
      </nav>

      {tab === "plan" ? <Planner /> : <Dashboard tier={tier} />}

      <footer className="foot">
        General guidance for healthy adults — not medical advice. Provider connectors use official
        OAuth scopes; sample data is shown until you link a real account.
      </footer>
    </div>
  );
}
