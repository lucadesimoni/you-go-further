import { describe, expect, it } from "vitest";
import {
  verifyStripeSignature,
  signStripePayload,
  parseStripeEvent,
  DevPaymentProvider,
  StripeProvider,
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
  it("prices a subscription order in rappen as a monthly recurring line", async () => {
    let captured = "";
    const provider = new StripeProvider("sk_test", SECRET);
    const realFetch = globalThis.fetch;
    globalThis.fetch = (async (_url: string, init: { body: string }) => {
      captured = init.body;
      return { ok: true, json: async () => ({ id: "cs_sub", url: "https://stripe.test/pay" }) };
    }) as unknown as typeof fetch;
    try {
      const order = newSubscriptionOrder("u1", "pro", 9);
      const session = await provider.createCheckout(order, { successUrl: "/ok", cancelUrl: "/no" });
      expect(session.ref).toBe("cs_sub");
      expect(captured).toContain("mode=subscription");
      expect(captured).toContain("%5Bunit_amount%5D=900"); // 9 CHF → 900 rappen
      expect(captured).toContain("%5Brecurring%5D%5Binterval%5D=month");
      expect(captured).toContain(`client_reference_id=${order.id}`);
    } finally {
      globalThis.fetch = realFetch;
    }
  });
});
