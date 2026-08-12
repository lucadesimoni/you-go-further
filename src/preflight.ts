/**
 * What has to be true before this is a production deployment.
 *
 * Every setting below has a safe default for development, and every one of
 * those defaults is wrong in production — a dev signing secret, an in-memory
 * store, the demo role switcher, a mailer that prints sign-in links to the log.
 * None of them fail loudly on their own: the app starts, serves traffic, and
 * looks healthy right up until the first restart loses the data or the first
 * stranger sends `x-role: owner`.
 *
 * So the checks are written down, run by `npm run preflight`, executed again by
 * the container before it starts the server, and unit-tested here rather than
 * living in a runbook nobody reads.
 *
 * Pure: it reads a plain environment object and returns findings. That is what
 * makes it testable, and what lets the same rules run in CI, in the entrypoint
 * and from an operator's shell against a `.env` file.
 */

import { DEV_AUTH_SECRET } from "./auth/jwt";

export type FindingLevel = "blocker" | "warning";

export interface PreflightFinding {
  /** Stable id, so a deployment can suppress or track one specific finding. */
  id: string;
  level: FindingLevel;
  /** What is wrong, in one line, for whoever is doing the deploy. */
  message: string;
  /** What to do about it. */
  fix: string;
}

export type Env = Record<string, string | undefined>;

/**
 * The signing secret shipped for development. Imported from the module that
 * defines it rather than copied — two spellings of one secret is how a check
 * for it stops matching.
 */
export const DEV_SECRET = DEV_AUTH_SECRET;

/** Below this a HMAC secret is guessable rather than secret. */
const MIN_SECRET_CHARS = 32;

const isTrue = (v: string | undefined) => /^(1|true|yes|on)$/i.test(v ?? "");

/** Read a setting under both its bare and `VITE_`-prefixed name, as config does. */
const read = (env: Env, key: string) => env[`VITE_${key}`] ?? env[key];

/** A database on this machine needs no TLS; one across a network does. */
function isLocalDatabase(url: string): boolean {
  try {
    const host = new URL(url).hostname;
    return host === "localhost" || host === "127.0.0.1" || host === "::1" || host === "db" || host === "postgres";
  } catch {
    return false;
  }
}

/**
 * Audit an environment for production readiness.
 *
 * Outside production the same rules run but nothing is a blocker — a developer
 * running `npm run preflight` locally should see what would stop a deploy
 * without being stopped themselves.
 */
export function preflight(env: Env): PreflightFinding[] {
  const production = (read(env, "APP_ENV") ?? "development") === "production";
  const findings: PreflightFinding[] = [];
  const add = (id: string, level: FindingLevel, message: string, fix: string) =>
    findings.push({ id, level: production ? level : "warning", message, fix });

  // --- Identity ------------------------------------------------------------
  const secret = env.AUTH_SECRET;
  if (!secret) {
    add(
      "auth-secret-missing",
      "blocker",
      "AUTH_SECRET is not set, so sessions are signed with the public development key.",
      "Generate one per environment: openssl rand -hex 32",
    );
  } else if (secret === DEV_SECRET) {
    add(
      "auth-secret-dev",
      "blocker",
      "AUTH_SECRET is still the development key that ships in this repository.",
      "Generate one per environment: openssl rand -hex 32",
    );
  } else if (secret.length < MIN_SECRET_CHARS) {
    add(
      "auth-secret-short",
      "blocker",
      `AUTH_SECRET is ${secret.length} characters; a session-signing key under ${MIN_SECRET_CHARS} is brute-forceable.`,
      "Generate one per environment: openssl rand -hex 32",
    );
  }

  // The demo role switcher is not a UI toggle. With it on, the server honours
  // an unauthenticated `x-role: owner` header — see `principalFrom` in the
  // Node adapter, which is why it reads config rather than trusting the header.
  if (isTrue(read(env, "ALLOW_ROLE_SWITCHING"))) {
    add(
      "role-switching-on",
      "blocker",
      "ALLOW_ROLE_SWITCHING is on: an unauthenticated request carrying `x-role: owner` is served as an owner.",
      "Set ALLOW_ROLE_SWITCHING=false. It exists for the demo personas, not for staging convenience.",
    );
  }

  // --- Durability ----------------------------------------------------------
  const backend = read(env, "STORE_BACKEND") ?? (env.DATABASE_URL ? "postgres" : "memory");
  if (backend === "memory") {
    add(
      "store-memory",
      "blocker",
      "The store backend is `memory`: every account, session and log is lost on restart.",
      "Provision Postgres and set DATABASE_URL (STORE_BACKEND=postgres follows automatically).",
    );
  } else if (backend === "file") {
    add(
      "store-file",
      "warning",
      "The store backend is `file`: durable only as long as DATA_DIR is a persistent volume, and single-node only.",
      "Fine for one small instance with a mounted volume. Use Postgres to run more than one replica.",
    );
  } else if (backend === "postgres") {
    const url = env.DATABASE_URL;
    if (!url) {
      add(
        "database-url-missing",
        "blocker",
        "STORE_BACKEND=postgres but DATABASE_URL is not set, so the app falls back to memory.",
        "Set DATABASE_URL to the managed database's connection string.",
      );
    } else if (!isLocalDatabase(url) && !/sslmode=|[?&]ssl=/.test(url)) {
      add(
        "database-no-tls",
        "warning",
        "DATABASE_URL points at a remote host with no TLS mode, so the connection may be in the clear.",
        "Append ?sslmode=require (managed Swiss Postgres offerings require TLS anyway).",
      );
    }
  }

  // --- Sign-in by email ----------------------------------------------------
  // The sign-in screen offers a magic link. With no mailer configured the link
  // is written to the server log, which means nobody outside the operations
  // team can create an account — a dead end that looks like a working deploy.
  const smtp = env.MAIL_SMTP_URL;
  const httpMail = env.MAIL_API_URL && env.MAIL_API_KEY;
  if (!smtp && !httpMail) {
    // `ALLOW_CONSOLE_MAIL=true` is the way to ship without email sign-in — a
    // deployment that only offers Google and Apple is a legitimate choice. It
    // has to be made out loud, though: the difference between "we decided not
    // to send email" and "we forgot to configure email" is invisible from the
    // outside and identical to the athlete staring at an inbox.
    if (isTrue(env.ALLOW_CONSOLE_MAIL)) {
      findings.push({
        id: "mailer-console-acknowledged",
        level: "warning",
        message: "Email sign-in is disabled by ALLOW_CONSOLE_MAIL: magic links go to the server log, not to athletes.",
        fix: "Configure a mailer before advertising email sign-in, or remove the option from the sign-in screen.",
      });
    } else {
      add(
        "mailer-console",
        "blocker",
        "No mailer is configured: magic-link sign-in prints the link to the server log instead of sending it.",
        "Set MAIL_SMTP_URL (e.g. a Swiss provider's submission endpoint) or MAIL_API_URL + MAIL_API_KEY — or set ALLOW_CONSOLE_MAIL=true to ship without email sign-in on purpose.",
      );
    }
  } else if (smtp && smtp.startsWith("smtp://") && !isTrue(env.MAIL_SMTP_STARTTLS)) {
    add(
      "mailer-plaintext",
      "blocker",
      "MAIL_SMTP_URL is plaintext SMTP with STARTTLS off, so the mailbox password crosses the network in the clear.",
      "Use smtps://…:465, or keep smtp://…:587 and set MAIL_SMTP_STARTTLS=true.",
    );
  }

  // --- Money ---------------------------------------------------------------
  const stripeKey = env.STRIPE_SECRET_KEY;
  const stripeHook = env.STRIPE_WEBHOOK_SECRET;
  if (isTrue(read(env, "SUBSCRIPTIONS_ENABLED")) && !stripeKey) {
    add(
      "payments-simulated",
      "blocker",
      "Subscriptions are on sale but no Stripe key is set, so checkout runs on the simulated provider.",
      "Set STRIPE_SECRET_KEY and STRIPE_WEBHOOK_SECRET, or leave SUBSCRIPTIONS_ENABLED off.",
    );
  }
  if (stripeKey && !stripeHook) {
    add(
      "payments-unverified-webhooks",
      "blocker",
      "STRIPE_SECRET_KEY is set without STRIPE_WEBHOOK_SECRET: settlement webhooks cannot be verified.",
      "Set STRIPE_WEBHOOK_SECRET from the Stripe dashboard's endpoint signing secret.",
    );
  }
  if (stripeKey?.startsWith("sk_live_") && !production) {
    findings.push({
      id: "payments-live-key-outside-production",
      level: "blocker",
      message: "A live Stripe key is set in a non-production environment, so test purchases would charge real cards.",
      fix: "Use the sk_test_… key outside production.",
    });
  }

  // --- Transport -----------------------------------------------------------
  if (!env.ALLOWED_ORIGINS) {
    add(
      "cors-open",
      "warning",
      "ALLOWED_ORIGINS is not set, so the API answers cross-origin requests from anywhere.",
      "Set ALLOWED_ORIGINS to your own origins when the SPA is served from a different host than the API.",
    );
  }
  if (!isTrue(env.TRUST_PROXY)) {
    add(
      "trust-proxy-off",
      "warning",
      "TRUST_PROXY is off: behind a load balancer every request looks like it comes from the proxy, so per-IP rate limits share one bucket.",
      "Set TRUST_PROXY=true only when a proxy you control terminates TLS in front of this server.",
    );
  }

  // --- Who is responsible for this ------------------------------------------
  // A service that holds health-adjacent data about named people has to say who
  // is holding it and how to reach them about it. The app cannot know — the
  // details belong to whoever runs the deployment — so an empty one here means
  // the privacy screen ships without a controller, which is both a legal
  // failure and, for an athlete deciding whether to trust it, a plain one.
  for (const [key, id, what] of [
    ["OPERATOR_NAME", "operator-name-missing", "the legal name of whoever runs this"],
    ["OPERATOR_ADDRESS", "operator-address-missing", "a postal address for the operator"],
    ["PRIVACY_CONTACT", "privacy-contact-missing", "a contact for data-protection requests"],
  ] as const) {
    if (!read(env, key)) {
      add(
        id,
        "blocker",
        `${key} is not set, so the privacy screen names nobody as responsible for the data.`,
        `Set ${key} to ${what}. Swiss law requires a service to identify itself, and both the revised FADP and the GDPR require a named controller.`,
      );
    }
  }
  if (!read(env, "TERMS_URL")) {
    add(
      "terms-url-missing",
      "warning",
      "TERMS_URL is not set, and the sign-in screen already tells people they agree to terms.",
      "Publish the terms and point TERMS_URL at them, or remove the claim from the sign-in screen.",
    );
  }

  // --- Analytics egress ----------------------------------------------------
  if (isTrue(read(env, "EXPORT_ENABLED")) && !(env.DATABRICKS_HOST && env.DATABRICKS_TOKEN)) {
    add(
      "export-unconfigured",
      "warning",
      "EXPORT_ENABLED is on but the Databricks target is not configured, so the sink silently does nothing.",
      "Set DATABRICKS_HOST, DATABRICKS_TOKEN, DATABRICKS_WAREHOUSE_ID and DATABRICKS_TABLE — or turn the flag off.",
    );
  }

  return findings;
}

/** True when nothing found would stop a deploy. */
export function passes(findings: PreflightFinding[]): boolean {
  return findings.every((f) => f.level !== "blocker");
}

/** Human-readable report, for a terminal or a CI log. */
export function formatFindings(findings: PreflightFinding[]): string {
  if (findings.length === 0) return "preflight: nothing to report — this environment is production-ready.";
  return findings
    .map((f) => `${f.level === "blocker" ? "BLOCKER" : "warning"}  ${f.id}\n  ${f.message}\n  → ${f.fix}`)
    .join("\n\n");
}
