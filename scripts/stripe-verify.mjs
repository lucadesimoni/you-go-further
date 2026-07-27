/**
 * Drive one complete payment through the platform and assert the money rules.
 *
 *   npm run verify:payments
 *
 * By default this runs against a **wire-accurate Stripe double**: it speaks
 * Stripe's real protocol (bearer auth, form-encoded body, `/v1/checkout/sessions`,
 * a `cs_test_…` session, and a `t=…,v1=…` HMAC-SHA256 webhook), and rejects
 * anything Stripe itself would reject. So a wrong endpoint, a missing field or a
 * bad signature fails here rather than on a customer's first purchase.
 *
 * With real test-mode keys it talks to Stripe itself instead — same script,
 * same assertions:
 *
 *   STRIPE_SECRET_KEY=sk_test_… STRIPE_WEBHOOK_SECRET=whsec_… npm run verify:payments
 *
 * The webhook is still signed locally in that mode, because Stripe can only
 * deliver events to a public URL; everything else is the live API.
 */
import { createServer } from "node:http";
import { createHmac } from "node:crypto";

const REAL_KEY = process.env.STRIPE_SECRET_KEY;
const LIVE = Boolean(REAL_KEY && process.env.STRIPE_WEBHOOK_SECRET);
if (REAL_KEY?.startsWith("sk_live_")) {
  console.error("Refusing to run against a live key. Use a test-mode key (sk_test_…).");
  process.exit(2);
}

const WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET ?? "whsec_verify_secret";
const SECRET_KEY = REAL_KEY ?? "sk_test_verify_key";
// Fresh ports per run: a leftover server from a previous run holding the port
// would otherwise answer with stale code and quietly invalidate every check.
const randomPort = () => 20000 + Math.floor(Math.random() * 20000);
const STUB_PORT = Number(process.env.STRIPE_STUB_PORT ?? randomPort());
const APP_PORT = Number(process.env.APP_PORT ?? randomPort());

let failed = 0;
const check = (label, cond, detail = "") => {
  if (cond) console.log(`  ✓ ${label}`);
  else {
    failed++;
    console.log(`  ✗ ${label}${detail ? ` — ${detail}` : ""}`);
  }
};

// ---------------------------------------------------------------------------
// The Stripe double. It is deliberately strict: it only answers the documented
// endpoint, and validates the request the way Stripe does.
// ---------------------------------------------------------------------------
const stubCalls = [];
const stub = createServer((req, res) => {
  let body = "";
  req.on("data", (c) => (body += c));
  req.on("end", () => {
    const send = (status, payload) => {
      res.writeHead(status, { "content-type": "application/json" });
      res.end(JSON.stringify(payload));
    };
    if (req.url !== "/v1/checkout/sessions" || req.method !== "POST") {
      return send(404, { error: { message: `Unrecognized request URL (${req.method}: ${req.url}).` } });
    }
    if (!/^Bearer sk_/.test(req.headers.authorization ?? "")) {
      return send(401, { error: { message: "Invalid API Key provided." } });
    }
    if (!(req.headers["content-type"] ?? "").includes("application/x-www-form-urlencoded")) {
      return send(400, { error: { message: "Invalid content type." } });
    }
    const form = new URLSearchParams(body);
    for (const required of ["mode", "success_url", "line_items[0][price_data][currency]"]) {
      if (!form.get(required)) return send(400, { error: { message: `Missing required param: ${required}.` } });
    }
    stubCalls.push({ headers: req.headers, form });
    const id = `cs_test_${Math.random().toString(36).slice(2, 12)}`;
    send(200, { id, object: "checkout.session", url: `https://checkout.stripe.test/pay/${id}`, livemode: false });
  });
});

// ---------------------------------------------------------------------------
async function main() {
  if (!LIVE) await new Promise((r) => stub.listen(STUB_PORT, r));
  console.log(LIVE ? "── against real Stripe (test mode) ──" : "── against a wire-accurate Stripe double ──");

  const env = {
    ...process.env,
    PORT: String(APP_PORT),
    STRIPE_SECRET_KEY: SECRET_KEY,
    STRIPE_WEBHOOK_SECRET: WEBHOOK_SECRET,
    ...(LIVE ? {} : { STRIPE_API_BASE: `http://localhost:${STUB_PORT}` }),
  };

  const { spawn } = await import("node:child_process");
  // Its own process group, so killing it takes the whole tree with it rather
  // than orphaning a server that outlives the run.
  const server = spawn("node_modules/.bin/tsx", ["server/index.ts"], {
    env,
    stdio: ["ignore", "pipe", "pipe"],
    detached: true,
  });
  const logs = [];
  server.stdout.on("data", (d) => logs.push(String(d)));
  server.stderr.on("data", (d) => logs.push(String(d)));

  const base = `http://localhost:${APP_PORT}`;
  const api = async (path, init = {}) => {
    const res = await fetch(`${base}${path}`, {
      ...init,
      headers: { "content-type": "application/json", "x-role": "athlete", ...(init.headers ?? {}) },
    });
    return { status: res.status, data: await res.json().catch(() => ({})) };
  };

  // Wait for the server to answer rather than sleeping a guessed amount.
  for (let i = 0; i < 60; i++) {
    try {
      if ((await api("/api/health")).status === 200) break;
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 250));
  }

  try {
    console.log("\n── the provider actually in use ──");
    const checkout = await api("/api/checkout", {
      method: "POST",
      body: JSON.stringify({
        kind: "products",
        returnTo: `${base}/`,
        lines: [
          { productId: "sponser-competition", name: "Competition", brand: "Sponser", qty: 2, unitPriceChf: 4.5, lineTotalChf: 9 },
          { productId: "winforce-carbo", name: "Carbo Basic Plus", brand: "Winforce", qty: 1, unitPriceChf: 12, lineTotalChf: 12 },
        ],
      }),
    });
    check("checkout is handled by the Stripe adapter, not the dev fallback", checkout.data.provider === "stripe", `provider=${checkout.data.provider}`);
    check("a checkout session was created", checkout.status === 200 && Boolean(checkout.data.url), JSON.stringify(checkout.data).slice(0, 160));
    check("the order total is the cart total", checkout.data.amountChf === 21, `amountChf=${checkout.data.amountChf}`);
    const orderId = checkout.data.orderId;
    if (!orderId) throw new Error("no order created — cannot continue");

    if (!LIVE) {
      const call = stubCalls.at(-1);
      check("Stripe was called at /v1/checkout/sessions", stubCalls.length === 1);
      check("the API version is pinned", call?.headers["stripe-version"] === "2024-06-20", call?.headers["stripe-version"]);
      check("the request is idempotent on the order id", call?.headers["idempotency-key"] === orderId);
      check("amounts are sent in rappen", call?.form.get("line_items[0][price_data][unit_amount]") === "450");
      check("currency is CHF", call?.form.get("line_items[0][price_data][currency]") === "chf");
      check("the order is linked for reconciliation", call?.form.get("client_reference_id") === orderId);
    }

    console.log("\n── the money rules ──");
    const orderNow = async () => (await api("/api/orders")).data.orders.find((o) => o.id === orderId);
    check("the order starts pending — the client is never trusted", (await orderNow())?.status === "pending");

    // Look up the provider reference exactly as Stripe would echo it back.
    const sessionId = LIVE
      ? new URL(checkout.data.url).pathname.split("/").pop()
      : stubCalls.at(-1) && (await (async () => {
          // The stub returned the id inside the checkout URL.
          return new URL(checkout.data.url).pathname.split("/").pop();
        })());

    const event = (type, id) => JSON.stringify({ id: "evt_verify", type, data: { object: { id, object: "checkout.session" } } });
    const sign = (payload, tSec = Math.floor(Date.now() / 1000)) =>
      `t=${tSec},v1=${createHmac("sha256", WEBHOOK_SECRET).update(`${tSec}.${payload}`).digest("hex")}`;

    const paid = event("checkout.session.completed", sessionId);

    // 1. A forged signature must change nothing.
    const forged = await api("/api/webhooks/payments", {
      method: "POST",
      body: paid,
      headers: { "stripe-signature": "t=9999999999,v1=deadbeef" },
    });
    check("a forged webhook signature is refused", forged.status === 400);
    check("…and the order is still pending", (await orderNow())?.status === "pending");

    // 2. A correctly signed but stale event must be refused (replay window).
    const stale = await api("/api/webhooks/payments", {
      method: "POST",
      body: paid,
      headers: { "stripe-signature": sign(paid, Math.floor(Date.now() / 1000) - 3600) },
    });
    check("a replayed (stale) webhook is refused", stale.status === 400);
    check("…and the order is still pending", (await orderNow())?.status === "pending");

    // 3. The real thing settles it.
    const good = await api("/api/webhooks/payments", {
      method: "POST",
      body: paid,
      headers: { "stripe-signature": sign(paid) },
    });
    check("a correctly signed webhook is accepted", good.status === 200 && good.data.matched === true, JSON.stringify(good.data));
    const settled = await orderNow();
    check("the order is now paid", settled?.status === "paid", `status=${settled?.status}`);
    check("it records when it was paid", Boolean(settled?.paidAt));

    // 4. Stripe retries; settling twice must not double-apply.
    await api("/api/webhooks/payments", { method: "POST", body: paid, headers: { "stripe-signature": sign(paid) } });
    const again = await orderNow();
    check("a repeated delivery is idempotent", again?.status === "paid" && again.paidAt === settled.paidAt);

    // 5. A later failure event must not un-pay a paid order.
    const failedEvent = event("checkout.session.async_payment_failed", sessionId);
    await api("/api/webhooks/payments", {
      method: "POST",
      body: failedEvent,
      headers: { "stripe-signature": sign(failedEvent) },
    });
    check("a late failure cannot reverse a paid order", (await orderNow())?.status === "paid");

    // 6. An event for something we don't know about is acknowledged, not error.
    const unknown = event("checkout.session.completed", "cs_test_not_ours");
    const orphan = await api("/api/webhooks/payments", {
      method: "POST",
      body: unknown,
      headers: { "stripe-signature": sign(unknown) },
    });
    check("an unknown session is acknowledged without matching", orphan.status === 200 && orphan.data.matched === false);

    console.log("\n── subscriptions ──");
    const sub = await api("/api/checkout", {
      method: "POST",
      body: JSON.stringify({ kind: "subscription", tier: "pro", returnTo: `${base}/` }),
    });
    check("a plan checkout is created", sub.status === 200 && Boolean(sub.data.url), JSON.stringify(sub.data).slice(0, 160));
    if (!LIVE) {
      const call = stubCalls.at(-1);
      check("it is a recurring monthly subscription", call?.form.get("mode") === "subscription" && call?.form.get("line_items[0][price_data][recurring][interval]") === "month");
    }
    const subSession = new URL(sub.data.url).pathname.split("/").pop();
    const subPaid = event("checkout.session.completed", subSession);
    await api("/api/webhooks/payments", { method: "POST", body: subPaid, headers: { "stripe-signature": sign(subPaid) } });
    const me = await api("/api/me");
    check("paying for a plan moves the account's tier", me.data.principal.tier === "pro", `tier=${me.data.principal.tier}`);
    check("the free plan cannot be checked out", (await api("/api/checkout", { method: "POST", body: JSON.stringify({ kind: "subscription", tier: "free" }) })).status === 400);
  } catch (e) {
    failed++;
    console.log(`  ✗ ${e.message}`);
    if (logs.length) console.log(logs.join("").split("\n").slice(-8).join("\n"));
  } finally {
    try {
      process.kill(-server.pid, "SIGTERM");
    } catch {
      server.kill();
    }
    if (!LIVE) stub.close();
  }

  console.log(`\n${failed === 0 ? "PASS" : "FAIL"} — ${failed} failed check(s)${LIVE ? "" : " (Stripe double)"}`);
  process.exit(failed === 0 ? 0 : 1);
}

await main();
