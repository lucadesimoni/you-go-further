import { describe, expect, it } from "vitest";
import {
  verifyStripeSignature,
  signStripePayload,
  parseStripeEvent,
  DevPaymentProvider,
  StripeProvider,
  STRIPE_API_VERSION,
} from "./payments";
import { newProductOrder, newSubscriptionOrder } from "./orders";

const SECRET = "whsec_test_secret";
const BODY = JSON.stringify({ type: "checkout.session.completed", data: { object: { id: "cs_123" } } });

describe("webhook signature verification", () => {
  it("accepts a correctly signed payload", () => {
    expect(verifyStripeSignature(BODY, signStripePayload(BODY, SECRET), SECRET)).toBe(true);
  });

  it("rejects a tampered body", () => {
    const sig = signStripePayload(BODY, SECRET);
    expect(verifyStripeSignature(BODY.replace("cs_123", "cs_evil"), sig, SECRET)).toBe(false);
  });

  it("rejects a wrong secret", () => {
    expect(verifyStripeSignature(BODY, signStripePayload(BODY, SECRET), "whsec_other")).toBe(false);
  });

  it("rejects a replayed (stale) signature outside the tolerance window", () => {
    const old = Math.floor(Date.now() / 1000) - 3600;
    expect(verifyStripeSignature(BODY, signStripePayload(BODY, SECRET, old), SECRET)).toBe(false);
  });

  it("rejects malformed headers", () => {
    expect(verifyStripeSignature(BODY, "garbage", SECRET)).toBe(false);
    expect(verifyStripeSignature(BODY, "t=abc,v1=xyz", SECRET)).toBe(false);
  });
});

describe("event parsing", () => {
  it("maps completion to paid and expiry to failed", () => {
    expect(parseStripeEvent(JSON.parse(BODY))).toEqual({ type: "paid", ref: "cs_123" });
    expect(parseStripeEvent({ type: "checkout.session.expired", data: { object: { id: "cs_9" } } })).toEqual({
      type: "failed",
      ref: "cs_9",
    });
  });

  it("ignores unrelated events", () => {
    expect(parseStripeEvent({ type: "customer.created", data: { object: { id: "cus_1" } } })).toBeNull();
  });
});

describe("DevPaymentProvider", () => {
  it("creates a local checkout session referencing the order", async () => {
    const order = newProductOrder("u1", [
      { productId: "p1", name: "Competition", brand: "Sponser", qty: 2, unitPriceChf: 2.2, lineTotalChf: 4.4 },
    ]);
    const session = await new DevPaymentProvider().createCheckout(order, {
      successUrl: "/done",
      cancelUrl: "/",
    });
    expect(session.ref).toContain(order.id);
    expect(session.url).toContain("/api/checkout/dev-complete");
  });

  it("verifies its own webhooks with the same scheme", () => {
    const p = new DevPaymentProvider(SECRET);
    expect(p.verifyWebhook(BODY, signStripePayload(BODY, SECRET))).toEqual({ type: "paid", ref: "cs_123" });
    expect(p.verifyWebhook(BODY, "t=1,v1=deadbeef")).toBeNull();
  });
});

describe("StripeProvider", () => {
  /** Capture what the adapter actually puts on the wire. */
  function captureFetch(response: { ok?: boolean; status?: number; body?: unknown }) {
    const calls: { url: string; headers: Record<string, string>; body: string }[] = [];
    const realFetch = globalThis.fetch;
    globalThis.fetch = (async (url: string, init: { body: string; headers: Record<string, string> }) => {
      calls.push({ url: String(url), headers: init.headers, body: init.body });
      return {
        ok: response.ok ?? true,
        status: response.status ?? 200,
        json: async () => response.body ?? { id: "cs_x", url: "https://stripe.test/pay" },
      };
    }) as unknown as typeof fetch;
    return { calls, restore: () => (globalThis.fetch = realFetch) };
  }

  it("posts to Stripe's real checkout endpoint with a pinned version and idempotency key", async () => {
    const cap = captureFetch({});
    try {
      const order = newSubscriptionOrder("u1", "pro", 9);
      await new StripeProvider("sk_test", SECRET).createCheckout(order, { successUrl: "/ok", cancelUrl: "/no" });
      // The path is Stripe's documented one — a typo here only shows up as a
      // failed payment in production, so it is asserted exactly.
      expect(cap.calls[0].url).toBe("https://api.stripe.com/v1/checkout/sessions");
      expect(cap.calls[0].headers["stripe-version"]).toBe(STRIPE_API_VERSION);
      expect(cap.calls[0].headers["content-type"]).toBe("application/x-www-form-urlencoded");
      expect(cap.calls[0].headers.authorization).toBe("Bearer sk_test");
      // Retrying must not create a second session — and so must not charge twice.
      expect(cap.calls[0].headers["idempotency-key"]).toBe(order.id);
    } finally {
      cap.restore();
    }
  });

  it("can be pointed at another API base without changing the request it makes", async () => {
    const cap = captureFetch({});
    try {
      const order = newProductOrder("u1", [
        { productId: "p1", name: "Gel", brand: "Sponser", qty: 2, unitPriceChf: 3.5, lineTotalChf: 7 },
      ]);
      await new StripeProvider("sk_test", SECRET, "http://localhost:9999").createCheckout(order, {
        successUrl: "/ok",
        cancelUrl: "/no",
      });
      expect(cap.calls[0].url).toBe("http://localhost:9999/v1/checkout/sessions");
    } finally {
      cap.restore();
    }
  });

  it("prices a subscription order in rappen as a monthly recurring line", async () => {
    const cap = captureFetch({ body: { id: "cs_sub", url: "https://stripe.test/pay" } });
    try {
      const order = newSubscriptionOrder("u1", "pro", 9);
      const session = await new StripeProvider("sk_test", SECRET).createCheckout(order, {
        successUrl: "/ok",
        cancelUrl: "/no",
      });
      expect(session.ref).toBe("cs_sub");
      const captured = cap.calls[0].body;
      expect(captured).toContain("mode=subscription");
      expect(captured).toContain("%5Bunit_amount%5D=900"); // 9 CHF → 900 rappen
      expect(captured).toContain("%5Brecurring%5D%5Binterval%5D=month");
      expect(captured).toContain(`client_reference_id=${order.id}`);
    } finally {
      cap.restore();
    }
  });

  it("prices a product order as one payment line per product", async () => {
    const cap = captureFetch({});
    try {
      const order = newProductOrder("u1", [
        { productId: "p1", name: "Competition", brand: "Sponser", qty: 2, unitPriceChf: 4.5, lineTotalChf: 9 },
        { productId: "p2", name: "Carbo Load", brand: "Winforce", qty: 1, unitPriceChf: 12, lineTotalChf: 12 },
      ]);
      await new StripeProvider("sk_test", SECRET).createCheckout(order, { successUrl: "/ok", cancelUrl: "/no" });
      const captured = decodeURIComponent(cap.calls[0].body);
      expect(captured).toContain("mode=payment");
      expect(captured).toContain("line_items[0][price_data][unit_amount]=450");
      expect(captured).toContain("line_items[0][quantity]=2");
      expect(captured).toContain("line_items[1][price_data][unit_amount]=1200");
      expect(captured).toContain("line_items[1][price_data][product_data][name]=Winforce+Carbo+Load");
    } finally {
      cap.restore();
    }
  });

  it("surfaces Stripe's own error message instead of a bare status", async () => {
    const cap = captureFetch({
      ok: false,
      status: 400,
      body: { error: { message: "You cannot use a live key in test mode.", code: "api_key_expired" } },
    });
    try {
      const order = newSubscriptionOrder("u1", "pro", 9);
      await expect(
        new StripeProvider("sk_test", SECRET).createCheckout(order, { successUrl: "/ok", cancelUrl: "/no" }),
      ).rejects.toThrow(/You cannot use a live key in test mode/);
    } finally {
      cap.restore();
    }
  });
});
