// Writes dist/config.js so the served SPA points its API at its own origin.
// Works for GitHub Codespaces' dynamic hostname and any node-served deploy —
// window.location.origin is resolved in the browser at load time.
import { writeFileSync, existsSync, mkdirSync } from "node:fs";

if (!existsSync("dist")) mkdirSync("dist", { recursive: true });

const content = `// Auto-generated (npm run codespace). Point the SPA at its own origin so the
// API, OAuth, sessions and persistence work behind the Codespace/host URL.
window.__APP_CONFIG__ = {
  apiBaseUrl: window.location.origin,
  environment: "codespace",
  allowRoleSwitching: true,
};
`;

writeFileSync("dist/config.js", content);
console.log("wrote dist/config.js → apiBaseUrl = window.location.origin");
