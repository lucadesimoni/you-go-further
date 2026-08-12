import { useEffect, useState } from "react";
import { isApiConfigured } from "../api/client";
import { useT } from "../i18n";

/**
 * Say when the device is offline.
 *
 * This is an installable app that athletes open at a trailhead, in a valley, on
 * a train through the Gotthard. Offline, the plan still computes — the whole
 * engine is local — but anything that has to reach the platform quietly does
 * not happen: a logged session, a synced profile, a fresh forecast. Silence is
 * the wrong answer to that. A person who is told "your log will be saved when
 * you are back" waits; a person told nothing taps the button again, and then
 * decides the app is broken.
 *
 * Only shown where it means something. In the client-side build there is no
 * server to be cut off from, so the banner would be a warning about nothing.
 */
export function OfflineBanner() {
  const t = useT();
  const [offline, setOffline] = useState(() => typeof navigator !== "undefined" && navigator.onLine === false);

  useEffect(() => {
    const on = () => setOffline(false);
    const off = () => setOffline(true);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, []);

  if (!offline || !isApiConfigured()) return null;

  return (
    <div className="offline-banner" role="status">
      <span className="offline-dot" aria-hidden />
      {t("app.offline")}
    </div>
  );
}
