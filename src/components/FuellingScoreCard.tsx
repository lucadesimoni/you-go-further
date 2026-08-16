import { type FuellingScore } from "../progress";
import { useT, type TranslationKey } from "../i18n";
import { actionText } from "../i18n/actions";

/** Band labels come from the engine; the UI translates them for display. */
const BAND_KEY: Record<FuellingScore["band"], TranslationKey> = {
  "getting-started": "insights.bandGettingStarted",
  building: "insights.bandBuilding",
  solid: "insights.bandSolid",
  "dialled-in": "insights.bandDialledIn",
};

/**
 * The fuelling score — how well you're actually fuelling, what's driving it, and
 * the single most useful thing to change next. Health warnings come first and
 * outrank performance advice.
 */
export function FuellingScoreCard({ score, onLearnMore }: { score: FuellingScore; onLearnMore?: () => void }) {
  const t = useT();
  const pct = score.score ?? 0;
  // Circumference of the r=52 ring, for the progress arc.
  const C = 2 * Math.PI * 52;

  return (
    <section className="panel">
      <div className="section-head">
        <h2>{t("insights.score")}</h2>
        <span className="pill">{t("insights.sessionsLogged", { count: score.sessionsLogged })}</span>
      </div>

      <div className={score.score === null ? "score-top score-top-empty" : "score-top"}>
        {/*
         * No ring until there is something to draw in it.
         *
         * An empty 120 px dial with a dash at its centre and "GETTING STARTED"
         * beneath it was the largest thing on Insights for every athlete who
         * had not yet logged a session — which is every athlete on their first
         * day. A gauge reading nothing is not a gauge; it is a picture of
         * absence, and it was taking a third of the screen to say what one
         * sentence says better.
         */}
        {score.score !== null && (
        <div className="score-ring-wrap">
          <svg className="score-ring" viewBox="0 0 120 120" role="img" aria-label={`Fuelling score ${score.score}`}>
            <circle className="score-track" cx="60" cy="60" r="52" />
            <circle
              className={`score-arc score-${score.band}`}
              cx="60"
              cy="60"
              r="52"
              strokeDasharray={`${(pct / 100) * C} ${C}`}
            />
            <text className="score-value" x="60" y="58" textAnchor="middle">
              {score.score}
            </text>
            <text className="score-band" x="60" y="76" textAnchor="middle">
              {t(BAND_KEY[score.band])}
            </text>
          </svg>
        </div>
        )}

        <div className="score-body">
          {score.score === null ? (
            <p className="detail" style={{ margin: 0 }}>
              {t("insights.notScored")}
            </p>
          ) : (
            <>
              {score.trend && (
                <p className={`score-trend score-trend-${score.trend.direction}`}>
                  {/* Was three hard-coded English sentences on a screen the app
                      otherwise speaks four languages on. */}
                  {score.trend.direction === "up"
                    ? t("insights.trendUp", { delta: score.trend.delta })
                    : score.trend.direction === "down"
                      ? t("insights.trendDown", { delta: Math.abs(score.trend.delta) })
                      : t("insights.trendFlat")}
                </p>
              )}
              <ul className="score-components">
                {score.components.map((c) => (
                  <li key={c.id} className="score-component">
                    <div className="score-component-head">
                      <span className="score-component-label">{c.label}</span>
                      <span className="score-component-value">{c.score}</span>
                    </div>
                    <div className="score-bar" aria-hidden>
                      <div className="score-bar-fill" style={{ width: `${c.score}%` }} />
                    </div>
                    <p className="score-component-detail">{c.detail}</p>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      </div>

      {score.healthFlags.length > 0 && (
        <div className="score-health">
          <h4 className="score-health-title">{t("insights.worthAttention")}</h4>
          {score.healthFlags.map((f, i) => (
            <p key={i} className="score-health-text">
              {f}
            </p>
          ))}
        </div>
      )}

      <div className="score-next">
        <h4 className="score-next-title">{t("insights.doNext")}</h4>
        <ol className="score-next-list">
          {score.nextActions.map((a, i) => {
            const text = actionText(a, t);
            return (
              <li key={i}>
                <strong>{text.title}</strong>
                <span>{text.why}</span>
              </li>
            );
          })}
        </ol>
        {onLearnMore && (
          <button type="button" className="link-btn" onClick={onLearnMore}>
            {t("guide.readGuide")}
          </button>
        )}
      </div>
    </section>
  );
}
