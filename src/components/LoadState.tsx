import { useT } from "../i18n";

/**
 * Waiting, empty, and broken are three different things.
 *
 * They were one. `activities` began as an empty array and a failed fetch was
 * caught into an empty array too, so a screen had no way to tell "we have not
 * asked yet" from "you have no sessions" from "the platform did not answer".
 * All three rendered the same sentence: *"No sessions yet. Connect a service
 * and your training appears here."*
 *
 * For an athlete on a train through the Gotthard, or one whose server is down,
 * that sentence is false and alarming in the same breath — it says their
 * training is gone and asks them to redo the setup they already did. Someone
 * will tap "Connect a service", authorise a second time, and still see
 * nothing. That is a one-star review written by a loading state.
 *
 * So each state says its own true thing, and the broken one offers the only
 * action that helps: try again.
 */
export type LoadState = "loading" | "ready" | "failed";

/** A quiet placeholder with the shape of the thing that is coming. */
export function LoadingBlock({ lines = 3 }: { lines?: number }) {
  const t = useT();
  return (
    <div className="loading-block" role="status" aria-live="polite" aria-busy="true">
      <span className="sr-only">{t("app.loading")}</span>
      {Array.from({ length: lines }, (_, i) => (
        <span key={i} className="skeleton-line" aria-hidden />
      ))}
    </div>
  );
}

/**
 * The platform could not be reached.
 *
 * Deliberately not a dead end: the retry re-runs the same load, because the
 * commonest cause is a tunnel, a lift, or a lost signal — all of which fix
 * themselves, and none of which a person should have to restart the app for.
 */
export function FailedBlock({ onRetry }: { onRetry?: () => void }) {
  const t = useT();
  return (
    <div className="failed-block" role="alert">
      <p className="failed-title">{t("app.loadFailed")}</p>
      <p className="detail">{t("app.loadFailedWhy")}</p>
      {onRetry && (
        <button type="button" className="btn btn-ghost mt-5" onClick={onRetry}>
          {t("app.retry")}
        </button>
      )}
    </div>
  );
}
