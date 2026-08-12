import React from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { I18nProvider } from "./i18n";
import { ErrorBoundary } from "./components/ErrorBoundary";
import "./styles.css";

const container = document.getElementById("root");
if (!container) throw new Error("Root element #root not found");

createRoot(container).render(
  <React.StrictMode>
    {/*
     * Outside the i18n provider on purpose: the boundary has to survive a
     * failure *in* the provider, and a fallback that depends on the thing that
     * broke is not a fallback.
     */}
    <ErrorBoundary>
      <I18nProvider>
        <App />
      </I18nProvider>
    </ErrorBoundary>
  </React.StrictMode>,
);

/**
 * A rejected promise nobody caught.
 *
 * React's error boundary only sees errors thrown while rendering. A failed
 * `await` in an event handler — a save, a sync, a checkout — lands here
 * instead, and until now landed nowhere: the interface simply did not respond
 * to the tap. Logging it is the least that is owed to whoever has to work out
 * why "Log this session" did nothing.
 */
window.addEventListener("unhandledrejection", (event) => {
  // eslint-disable-next-line no-console
  console.error("Unhandled promise rejection:", event.reason);
});

// Register the service worker for installability + offline app shell.
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).catch(() => {
      /* SW registration is a progressive enhancement; ignore failures. */
    });
  });
}
