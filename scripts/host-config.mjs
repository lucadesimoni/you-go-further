// Writes dist/config.js so the served SPA points its API at its own origin.
// Used by any single-origin Node deploy (Render, Fly, a VM) — the same idea as
// codespace-config.mjs but environment-agnostic and able to inject optional
// public client ids from the host's env vars (so real Google/Apple sign-in works
// without a rebuild). window.location.origin is resolved in the browser at load.
import { writeFileSync, existsSync, mkdirSync } from "node:fs";

if (!existsSync("dist")) mkdirSync("dist", { recursive: true });

const env = process.env.APP_ENV ?? "production";
const allowRoleSwitching = process.env.ALLOW_ROLE_SWITCHING === "true";

const lines = [
  "  apiBaseUrl: window.location.origin,",
  `  environment: ${JSON.stringify(env)},`,
  `  allowRoleSwitching: ${allowRoleSwitching},`,
];
// Optional, public (non-secret) client config — safe to embed in the SPA.
if (process.env.GOOGLE_CLIENT_ID) lines.push(`  googleClientId: ${JSON.stringify(process.env.GOOGLE_CLIENT_ID)},`);
if (process.env.APPLE_CLIENT_ID) lines.push(`  appleClientId: ${JSON.stringify(process.env.APPLE_CLIENT_ID)},`);
if (process.env.ENABLED_PROVIDERS) lines.push(`  enabledProviders: ${JSON.stringify(process.env.ENABLED_PROVIDERS)},`);

writeFileSync("dist/config.js", `window.__APP_CONFIG__ = {\n${lines.join("\n")}\n};\n`);
console.log(`wrote dist/config.js → apiBaseUrl = window.location.origin (env=${env})`);
