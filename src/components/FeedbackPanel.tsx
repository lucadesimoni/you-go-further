import type { AdaptationInsight, SessionFeedback } from "../feedback";
import { useT, type TranslationKey } from "../i18n";

/** Confidence, keyed rather than spelled out, so it reads in every language. */
const CONF_KEY = {
  none: "log.confNone",
  low: "log.confLow",
  medium: "log.confMedium",
  high: "log.confHigh",
} as const;

/**
 * What the app has learned from this athlete's logged sessions, shown beside the
 * plan it shaped.
 *
 * It used to *ask* here as well — gut and energy chips and a "log session"
 * button, directly under a plan for a session that has not happened yet. A
 * session can only be judged once it has been run, and the log was anonymous
 * into the bargain: no activity id, so it could never become a debrief. That
 * belongs on the session, and lives there now (`SessionDebrief`, reachable from
 * every recorded session on the start screen).
 *
 * What stays is the readout, because it earns its place on this screen: it is
 * the reason the target above says 75 g/h rather than 90.
 */
export function FeedbackPanel({
  insight,
  feedbacks,
  persistence,
}: {
  insight: AdaptationInsight;
  feedbacks: SessionFeedback[];
  persistence: "server" | "local";
}) {
  const t = useT();

  return (
    <div className="panel feedback">
      <div className="section-head">
        <h3 style={{ margin: 0, fontSize: 17 }}>{t("log.title")}</h3>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span className={`pill${persistence === "server" ? " pill-live" : ""}`}>
            {persistence === "server" ? t("log.synced") : t("profile.savedLocally")}
          </span>
        </div>
      </div>
      <p className="detail">{t("log.sub")}</p>

      {/* What we learned */}
      <div className={`fb-insight${insight.samples > 0 ? " on" : ""}`}>
        <div className="fb-insight-head">
          <strong>{t("log.learned")}</strong>
          <span className="pill">
            {t("log.samplesLogged", { count: insight.samples })} · {t(CONF_KEY[insight.confidence])}
          </span>
        </div>
        <div className="fb-badges">
          {insight.carbCeilingG !== undefined && <span className="fb-badge cap">{t("log.carbCeiling", { n: insight.carbCeilingG })}</span>}
          {(insight.carbBiasG ?? 0) > 0 && <span className="fb-badge up">+{insight.carbBiasG} g/h</span>}
          {insight.carbCeilingG === undefined && !(insight.carbBiasG ?? 0) && <span className="fb-badge">{t("log.targetsUnchanged")}</span>}
        </div>
        <ul className="fb-rationale">
          {insight.rationale.map((r, i) => (
            <li key={i}>{r}</li>
          ))}
        </ul>
      </div>

      {feedbacks.length > 0 && (
        <ul className="fb-history">
          {feedbacks.slice(0, 5).map((f) => (
            <li key={f.id}>
              <span className="fb-when">{new Date(f.date).toLocaleDateString()}</span>
              <span className={`fb-tag gi-${f.gi}`}>GI {t(`debrief.gi.${f.gi}` as TranslationKey)}</span>
              <span className={`fb-tag en-${f.energy}`}>{t(`debrief.energy.${f.energy}` as TranslationKey)}</span>
              <span className="fb-planned">@ {f.plannedCarbPerHourG} g/h</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
