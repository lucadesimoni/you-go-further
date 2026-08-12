import { useState } from "react";
import type { Account } from "../auth";
import { api, isApiConfigured } from "../api/client";
import { loadProfile } from "../api/profileStore";
import { loadFeedback } from "../api/feedbackStore";
import { loadActivities, loadConnections } from "../api/trainingData";
import { getConfig } from "../config";
import { confirm } from "../ui/confirm";
import { toast } from "../ui/toast";
import { useT } from "../i18n";

/**
 * The operator may give an address or a link to a contact form; both are
 * legitimate contact points, and guessing wrong turns a working link dead.
 */
function contactHref(contact: string): string {
  return /^(https?|mailto):/i.test(contact) ? contact : `mailto:${contact}`;
}

/**
 * What we hold, where it goes, and the two buttons that make that a promise.
 *
 * This screen exists because the app collects health-adjacent data — weight,
 * heart rate, sweat rate, readiness, every route an athlete has run — and until
 * now it said nothing about that anywhere, while the sign-in screen already
 * claimed "you agree to our terms". Under the revised Swiss Data Protection Act
 * and the GDPR the athlete has a right to know, a right to a copy, and a right
 * to have it erased. Two of those are buttons, so they are buttons here, and
 * neither is gated by tier: portability is not a paid feature.
 *
 * What this page deliberately does *not* do is invent a legal entity. The
 * controller's name, address and contact come from configuration, because they
 * belong to whoever runs the deployment; a made-up Impressum would be worse
 * than an empty one, so an unconfigured build says so instead. `preflight`
 * refuses to call such a build production-ready.
 */
export function PrivacyView({ account }: { account: Account }) {
  const t = useT();
  const [busy, setBusy] = useState<"export" | "delete" | null>(null);
  const cfg = getConfig();
  // A name is the minimum that makes this section true. An address without one
  // identifies nobody, so the whole block falls back rather than half-render.
  const named = cfg.operatorName.trim().length > 0;

  /**
   * Build the export.
   *
   * With a server this is the server's own answer, so it includes what only the
   * server holds. Without one the same document is assembled from the browser's
   * stores — an export that quietly returned nothing on the client-side build
   * would be worse than no button.
   */
  const exportData = async () => {
    setBusy("export");
    try {
      const data = isApiConfigured()
        ? await api.exportMyData()
        : {
            exportedAt: new Date().toISOString(),
            account: { id: account.id, name: account.name, email: account.email, role: account.role },
            profile: loadProfile(),
            connections: (await loadConnections()).map((provider) => ({ provider })),
            activities: await loadActivities(),
            sessionLogs: await loadFeedback(account.role),
          };
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `you-go-further-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success(t("privacy.exported"));
    } catch {
      toast.error(t("privacy.exportFailed"));
    } finally {
      setBusy(null);
    }
  };

  const deleteAccount = async () => {
    const ok = await confirm({
      title: t("privacy.deleteConfirmTitle"),
      message: t("privacy.deleteConfirmBody"),
      confirmLabel: t("privacy.deleteConfirm"),
      danger: true,
    });
    if (!ok) return;
    setBusy("delete");
    try {
      if (isApiConfigured()) await api.deleteMe();
      // Whatever the server did, the copies in this browser go too — a profile
      // left in localStorage would repopulate the next account on this device.
      try {
        localStorage.clear();
        sessionStorage.clear();
      } catch {
        /* private mode */
      }
      toast.success(t("privacy.deleted"));
      // A hard reload rather than a state change: nothing in memory should
      // outlive an account that no longer exists.
      window.location.replace("/");
    } catch {
      setBusy(null);
      toast.error(t("privacy.deleteFailed"));
    }
  };

  return (
    <main className="dash privacy">
      <section className="panel">
        <div className="section-head">
          <h2>{t("privacy.title")}</h2>
          <span className="pill">{isApiConfigured() ? t("privacy.onServer") : t("privacy.onDevice")}</span>
        </div>
        <p className="detail">{t("privacy.lead")}</p>
      </section>

      <section className="panel">
        <div className="section-head">
          <h2>{t("privacy.whatWeHold")}</h2>
        </div>
        <dl className="privacy-list">
          <div>
            <dt>{t("privacy.itemAccount")}</dt>
            <dd>{t("privacy.itemAccountWhy")}</dd>
          </div>
          <div>
            <dt>{t("privacy.itemBody")}</dt>
            <dd>{t("privacy.itemBodyWhy")}</dd>
          </div>
          <div>
            <dt>{t("privacy.itemTraining")}</dt>
            <dd>{t("privacy.itemTrainingWhy")}</dd>
          </div>
          <div>
            <dt>{t("privacy.itemLogs")}</dt>
            <dd>{t("privacy.itemLogsWhy")}</dd>
          </div>
        </dl>
      </section>

      <section className="panel">
        <div className="section-head">
          <h2>{t("privacy.whereItGoes")}</h2>
        </div>
        {/* The honest version. A claim of Swiss hosting that quietly excludes
            the interesting parts is worse than no claim. */}
        <p className="detail">{t("privacy.whereLead")}</p>
        <ul className="privacy-third-parties">
          <li>
            <strong>{t("privacy.tpProviders")}</strong> {t("privacy.tpProvidersWhy")}
          </li>
          <li>
            <strong>{t("privacy.tpGeo")}</strong> {t("privacy.tpGeoWhy")}
          </li>
          <li>
            <strong>{t("privacy.tpTiles")}</strong> {t("privacy.tpTilesWhy")}
          </li>
          <li>
            <strong>{t("privacy.tpMail")}</strong> {t("privacy.tpMailWhy")}
          </li>
        </ul>
        <p className="detail">{t("privacy.noAds")}</p>
      </section>

      <section className="panel panel-card privacy-rights">
        <div className="section-head">
          <h2>{t("privacy.yourRights")}</h2>
        </div>
        <p className="detail">{t("privacy.rightsLead")}</p>
        <div className="privacy-actions">
          <button type="button" className="btn btn-ghost" onClick={exportData} disabled={busy !== null}>
            {busy === "export" ? "…" : t("privacy.exportMine")}
          </button>
          <button
            type="button"
            className="btn btn-ghost btn-danger"
            onClick={deleteAccount}
            disabled={busy !== null}
          >
            {busy === "delete" ? "…" : t("privacy.deleteMine")}
          </button>
        </div>
        <p className="detail privacy-retain">{t("privacy.retainNote")}</p>
      </section>

      {/* Configured, or stated as missing — never invented. */}
      <section className="panel">
        <div className="section-head">
          <h2>{t("privacy.operator")}</h2>
        </div>
        {named ? (
          <address className="privacy-operator">
            <strong>{cfg.operatorName}</strong>
            {cfg.operatorAddress && <span className="privacy-address">{cfg.operatorAddress}</span>}
            {cfg.privacyContact && (
              <span>
                {t("privacy.operatorContact")}{" "}
                <a className="link-strong" href={contactHref(cfg.privacyContact)}>
                  {cfg.privacyContact}
                </a>
              </span>
            )}
            {cfg.termsUrl && (
              <a className="link-strong" href={cfg.termsUrl} target="_blank" rel="noreferrer">
                {t("privacy.operatorTerms")}
              </a>
            )}
          </address>
        ) : (
          <p className="detail">{t("privacy.operatorTodo")}</p>
        )}
      </section>
    </main>
  );
}
