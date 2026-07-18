// Runtime configuration — edit per environment WITHOUT rebuilding the app.
// These values override build-time env vars and defaults (see src/config.ts).
// The container entrypoint / your CDN can template this file at deploy time.
//
// window.__APP_CONFIG__ = {
//   environment: "production",
//   basePath: "/",
//   apiBaseUrl: "https://api.yougofurther.example",
//   storeBackend: "warehouse",           // "memory" | "warehouse"
//   warehouseUrl: "",                     // set server-side, not here
//   enabledProviders: "strava,garmin,polar,suunto",
//   exportEnabled: true,
//   defaultTier: "free",                  // "free" | "pro" | "elite"
//   allowRoleSwitching: false,            // turn the demo persona switcher off
//   version: "0.2.0",
// };
window.__APP_CONFIG__ = window.__APP_CONFIG__ || {};
