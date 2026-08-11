/**
 * Audit an environment for production readiness.
 *
 *   npm run preflight                     # this shell's environment
 *   npm run preflight -- deploy/prod.env  # a dotenv-style file
 *
 * Exits non-zero when something would stop a deploy, so it works as a CI gate
 * and as the container's entrypoint check. The rules themselves live in
 * `src/preflight.ts` and are unit-tested; this file only reads and prints.
 */
import { readFileSync } from "node:fs";
import { preflight, passes, formatFindings, type Env } from "../src/preflight.ts";

/** Minimal dotenv: `KEY=value`, `#` comments, optional surrounding quotes. */
function parseEnvFile(text: string): Env {
  const env: Env = {};
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq < 1) continue;
    const key = trimmed.slice(0, eq).trim().replace(/^export\s+/, "");
    let value = trimmed.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    env[key] = value;
  }
  return env;
}

const file = process.argv[2];
const env: Env = file ? parseEnvFile(readFileSync(file, "utf8")) : { ...process.env };
const where = file ? file : "the current environment";

const findings = preflight(env);
const ok = passes(findings);

console.log(`── preflight · ${where} · APP_ENV=${env.VITE_APP_ENV ?? env.APP_ENV ?? "development"} ──\n`);
console.log(formatFindings(findings));

// Node 22 is what the Dockerfile, CI and the devcontainer all run. Older
// releases lack the `node:` built-ins this server uses without a flag.
const major = Number(process.versions.node.split(".")[0]);
if (!file && major < 22) {
  console.log(`\nwarning  node-version\n  Running on Node ${process.versions.node}; this app targets Node 22+.`);
}

const counts = findings.reduce(
  (acc, f) => ({ ...acc, [f.level]: (acc[f.level] ?? 0) + 1 }),
  {} as Record<string, number>,
);
console.log(
  `\n${ok ? "PASS" : "FAIL"} — ${counts.blocker ?? 0} blocker(s), ${counts.warning ?? 0} warning(s)`,
);
process.exit(ok ? 0 : 1);
