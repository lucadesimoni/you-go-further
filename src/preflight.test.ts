import { describe, it, expect } from "vitest";
import { preflight, passes, formatFindings, DEV_SECRET, type Env } from "./preflight";

/**
 * A checklist nobody can run is a wish. These tests are what make the preflight
 * a gate: each rule is asserted against the environment that should trip it and
 * against one that should not, so a rule cannot quietly stop firing.
 */

/** A production environment with every check satisfied. */
const GOOD: Env = {
  APP_ENV: "production",
  AUTH_SECRET: "d5f1a2b3c4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8f",
  ALLOW_ROLE_SWITCHING: "false",
  DATABASE_URL: "postgres://ygf:pw@db.example.ch:5432/ygf?sslmode=require",
  MAIL_SMTP_URL: "smtps://no-reply%40yougofurther.ch:pw@mail.infomaniak.com:465",
  ALLOWED_ORIGINS: "https://yougofurther.ch",
  TRUST_PROXY: "true",
};

const ids = (env: Env) => preflight(env).map((f) => f.id);
const blockers = (env: Env) => preflight(env).filter((f) => f.level === "blocker").map((f) => f.id);

describe("production preflight", () => {
  it("passes a correctly configured production environment", () => {
    expect(preflight(GOOD)).toEqual([]);
    expect(passes(preflight(GOOD))).toBe(true);
  });

  it("blocks the development signing key, a missing one, and a short one", () => {
    expect(blockers({ ...GOOD, AUTH_SECRET: undefined })).toContain("auth-secret-missing");
    expect(blockers({ ...GOOD, AUTH_SECRET: DEV_SECRET })).toContain("auth-secret-dev");
    expect(blockers({ ...GOOD, AUTH_SECRET: "short" })).toContain("auth-secret-short");
  });

  it("blocks the demo role switcher, which the API honours as an unauthenticated login", () => {
    expect(blockers({ ...GOOD, ALLOW_ROLE_SWITCHING: "true" })).toContain("role-switching-on");
    // The VITE_-prefixed spelling is the one the SPA build uses; both reach config.
    expect(blockers({ ...GOOD, ALLOW_ROLE_SWITCHING: undefined, VITE_ALLOW_ROLE_SWITCHING: "true" })).toContain(
      "role-switching-on",
    );
  });

  it("blocks a store that forgets everything on restart", () => {
    const memory = { ...GOOD, DATABASE_URL: undefined };
    expect(blockers(memory)).toContain("store-memory");
    // The file backend is durable enough for one instance — a warning, not a stop.
    const file = { ...GOOD, DATABASE_URL: undefined, STORE_BACKEND: "file" };
    expect(blockers(file)).not.toContain("store-file");
    expect(ids(file)).toContain("store-file");
  });

  it("blocks postgres selected without a connection string", () => {
    expect(blockers({ ...GOOD, STORE_BACKEND: "postgres", DATABASE_URL: undefined })).toContain(
      "database-url-missing",
    );
  });

  it("warns about a remote database with no TLS, and stays quiet about a local one", () => {
    expect(ids({ ...GOOD, DATABASE_URL: "postgres://ygf:pw@db.example.ch:5432/ygf" })).toContain("database-no-tls");
    expect(ids({ ...GOOD, DATABASE_URL: "postgres://ygf:pw@db:5432/ygf" })).not.toContain("database-no-tls");
    expect(ids({ ...GOOD, DATABASE_URL: "postgres://ygf:pw@localhost:5432/ygf" })).not.toContain("database-no-tls");
  });

  it("blocks a deploy whose sign-in emails would only reach the server log", () => {
    expect(blockers({ ...GOOD, MAIL_SMTP_URL: undefined })).toContain("mailer-console");
    // An HTTP transactional provider satisfies it just as well as SMTP.
    const http = { ...GOOD, MAIL_SMTP_URL: undefined, MAIL_API_URL: "https://api.example/send", MAIL_API_KEY: "k" };
    expect(ids(http)).not.toContain("mailer-console");
  });

  it("lets a deploy ship without email sign-in, but only by saying so", () => {
    const acknowledged = { ...GOOD, MAIL_SMTP_URL: undefined, ALLOW_CONSOLE_MAIL: "true" };
    expect(passes(preflight(acknowledged))).toBe(true);
    // Still reported: an operator reading the log learns email sign-in is off.
    expect(ids(acknowledged)).toContain("mailer-console-acknowledged");
  });

  it("blocks a mailbox password sent over plaintext SMTP", () => {
    const plain = { ...GOOD, MAIL_SMTP_URL: "smtp://user:pw@mail.example.ch:587" };
    expect(blockers(plain)).toContain("mailer-plaintext");
    // The same host with STARTTLS is exactly how port 587 is meant to be used.
    expect(ids({ ...plain, MAIL_SMTP_STARTTLS: "true" })).not.toContain("mailer-plaintext");
  });

  it("blocks taking money through the simulated provider, or on unverified webhooks", () => {
    expect(blockers({ ...GOOD, SUBSCRIPTIONS_ENABLED: "true" })).toContain("payments-simulated");
    expect(blockers({ ...GOOD, STRIPE_SECRET_KEY: "sk_test_x" })).toContain("payments-unverified-webhooks");
    const configured = { ...GOOD, SUBSCRIPTIONS_ENABLED: "true", STRIPE_SECRET_KEY: "sk_test_x", STRIPE_WEBHOOK_SECRET: "whsec_x" };
    expect(preflight(configured)).toEqual([]);
  });

  it("blocks a live payment key outside production, wherever it is found", () => {
    // Deliberately not softened by the non-production rule below: a live key on
    // a staging box charges real cards, which is worse in staging, not better.
    const staging = { ...GOOD, APP_ENV: "staging", STRIPE_SECRET_KEY: "sk_live_x", STRIPE_WEBHOOK_SECRET: "whsec_x" };
    expect(blockers(staging)).toContain("payments-live-key-outside-production");
  });

  it("warns rather than blocks outside production, so a developer is never stopped", () => {
    const dev: Env = { APP_ENV: "development" };
    const found = preflight(dev);
    expect(found.length).toBeGreaterThan(3);
    expect(found.every((f) => f.level === "warning")).toBe(true);
    expect(passes(found)).toBe(true);
  });

  it("says what to do about every finding it reports", () => {
    for (const f of preflight({ APP_ENV: "production" })) {
      expect(f.message.length, `${f.id} has no message`).toBeGreaterThan(20);
      expect(f.fix.length, `${f.id} offers no fix`).toBeGreaterThan(20);
    }
  });

  it("reports cleanly when there is nothing to say", () => {
    expect(formatFindings([])).toMatch(/production-ready/);
    expect(formatFindings(preflight({ APP_ENV: "production" }))).toMatch(/BLOCKER/);
  });
});
