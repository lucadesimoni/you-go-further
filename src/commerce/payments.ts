import { createHmac, timingSafeEqual } from "node:crypto";
import type { Order } from "./orders";

/**
 * Payment providers. `StripeProvider` talks to the real Stripe API (Checkout
 * Sessions + signed webhooks); `DevPaymentProvider` simulates the same contract
 * so the whole purchase flow is runnable without keys — the identical
 * real-adapter-plus-fallback pattern used by the activity connectors.
 *
 * Server-only (node:crypto, secret keys) — never imported by the browser bundle.
 */
export interface CheckoutSession {
  /** Provider reference stored on the order and echoed back by the webhook. */
  ref: string;
  /** Where to send the customer to pay. */
  url: string;
}

/** A payment outcome parsed from a verified webhook. */
export interface PaymentEvent {
  type: "paid" | "failed";
  /** The provider reference that identifies the order. */
  ref: string;
}

export interface CheckoutUrls {
  successUrl: string;
  cancelUrl: string;
}

export interface PaymentProvider {
  readonly id: "stripe" | "dev";
  createCheckout(order: Order, urls: CheckoutUrls): Promise<CheckoutSession>;
  /** Verify a raw webhook body + signature header. Returns null if invalid. */
  verifyWebhook(rawBody: string, signature: string): PaymentEvent | null;
}

const chfToRappen = (chf: number) => Math.round(chf * 100);

/** Constant-time compare of two hex digests. */
function safeEqualHex(a: string, b: string): boolean {
  const ab = Buffer.from(a, "hex");
  const bb = Buffer.from(b, "hex");
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

/**
 * Verify a Stripe-style signature header: `t=<unix>,v1=<hex hmac>` where the
 * signed payload is `${t}.${rawBody}` under HMAC-SHA256. Rejects signatures
 * outside the tolerance window to blunt replay attacks.
 */
export function verifyStripeSignature(
  rawBody: string,
  header: string,
  secret: string,
  toleranceSec = 300,
  nowSec = Math.floor(Date.now() / 1000),
): boolean {
  const parts = Object.fromEntries(
    header
      .split(",")
      .map((p) => p.trim().split("="))
      .filter((kv): kv is [string, string] => kv.length === 2),
  );
  const t = Number(parts.t);
  const v1 = parts.v1;
  if (!Number.isFinite(t) || !v1) return false;
  if (Math.abs(nowSec - t) > toleranceSec) return false;
  const expected = createHmac("sha256", secret).update(`${t}.${rawBody}`).digest("hex");
  try {
    return safeEqualHex(expected, v1);
  } catch {
    return false;
  }
}

/** Build the Stripe-style signature header for a payload (used in tests/dev). */
export function signStripePayload(rawBody: string, secret: string, tSec = Math.floor(Date.now() / 1000)): string {
  const v1 = createHmac("sha256", secret).update(`${tSec}.${rawBody}`).digest("hex");
  return `t=${tSec},v1=${v1}`;
}

/** Map a Stripe event object to our payment outcome, or null if uninteresting. */
export function parseStripeEvent(body: unknown): PaymentEvent | null {
  const e = body as { type?: string; data?: { object?: { id?: string; client_reference_id?: string } } };
  const obj = e.data?.object;
  const ref = obj?.id;
  if (!ref) return null;
  if (e.type === "checkout.session.completed" || e.type === "checkout.session.async_payment_succeeded") {
    return { type: "paid", ref };
  }
  if (e.type === "checkout.session.async_payment_failed" || e.type === "checkout.session.expired") {
    return { type: "failed", ref };
  }
  return null;
}

/**
 * The Stripe REST API version this adapter is written against. Pinning it means
 * Stripe cannot change response shapes underneath us when the account default
 * moves; upgrading is then a deliberate, reviewable change.
 */
export const STRIPE_API_VERSION = "2024-06-20";

export const STRIPE_API_BASE = "https://api.stripe.com";

export class StripeProvider implements PaymentProvider {
  readonly id = "stripe" as const;

  constructor(
    private readonly secretKey: string,
    private readonly webhookSecret: string,
    /** Overridable so the checkout lifecycle can be driven against a local double. */
    private readonly apiBase: string = STRIPE_API_BASE,
  ) {}

  async createCheckout(order: Order, urls: CheckoutUrls): Promise<CheckoutSession> {
    const form = new URLSearchParams();
    form.set("mode", order.kind === "subscription" ? "subscription" : "payment");
    form.set("success_url", urls.successUrl);
    form.set("cancel_url", urls.cancelUrl);
    form.set("client_reference_id", order.id);

    if (order.kind === "subscription") {
      form.set("line_items[0][quantity]", "1");
      form.set("line_items[0][price_data][currency]", "chf");
      form.set("line_items[0][price_data][product_data][name]", `You Go Further ${order.tier ?? ""} plan`.trim());
      form.set("line_items[0][price_data][unit_amount]", String(chfToRappen(order.amountChf)));
      form.set("line_items[0][price_data][recurring][interval]", "month");
    } else {
      order.lines.forEach((line, i) => {
        form.set(`line_items[${i}][quantity]`, String(line.qty));
        form.set(`line_items[${i}][price_data][currency]`, "chf");
        form.set(`line_items[${i}][price_data][product_data][name]`, `${line.brand} ${line.name}`);
        form.set(`line_items[${i}][price_data][unit_amount]`, String(chfToRappen(line.unitPriceChf)));
      });
    }

    const res = await fetch(`${this.apiBase}/v1/checkout/sessions`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${this.secretKey}`,
        "content-type": "application/x-www-form-urlencoded",
        "stripe-version": STRIPE_API_VERSION,
        // Our order id is a natural idempotency key: a retried request (network
        // blip, double tap) returns the original session instead of charging
        // the athlete for a second one.
        "idempotency-key": order.id,
      },
      body: form.toString(),
    });
    const data = (await res.json().catch(() => ({}))) as {
      id?: string;
      url?: string;
      error?: { message?: string; code?: string };
    };
    if (!res.ok) {
      // Stripe explains itself in the body; passing that through is the
      // difference between a fixable error and a mystery.
      throw new Error(`Stripe checkout failed (${res.status}): ${data.error?.message ?? "no details"}`);
    }
    if (!data.id || !data.url) throw new Error("Stripe returned no checkout session");
    return { ref: data.id, url: data.url };
  }

  verifyWebhook(rawBody: string, signature: string): PaymentEvent | null {
    if (!verifyStripeSignature(rawBody, signature, this.webhookSecret)) return null;
    try {
      return parseStripeEvent(JSON.parse(rawBody));
    } catch {
      return null;
    }
  }
}

/**
 * Simulated provider for demo/offline use. Checkout "redirects" to a local
 * confirmation route; webhooks are signed with the same scheme as Stripe so the
 * server path under test is identical.
 */
export class DevPaymentProvider implements PaymentProvider {
  readonly id = "dev" as const;

  constructor(private readonly webhookSecret = "dev-webhook-secret") {}

  async createCheckout(order: Order, urls: CheckoutUrls): Promise<CheckoutSession> {
    const ref = `dev_cs_${order.id}`;
    const url = `/api/checkout/dev-complete?ref=${encodeURIComponent(ref)}&return_to=${encodeURIComponent(
      urls.successUrl,
    )}`;
    return { ref, url };
  }

  verifyWebhook(rawBody: string, signature: string): PaymentEvent | null {
    if (!verifyStripeSignature(rawBody, signature, this.webhookSecret)) return null;
    try {
      return parseStripeEvent(JSON.parse(rawBody));
    } catch {
      return null;
    }
  }
}

const env = (k: string): string | undefined =>
  (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env?.[k];

/** Real Stripe when keys are present, otherwise the simulated provider. */
export function paymentProviderFromEnv(): PaymentProvider {
  const key = env("STRIPE_SECRET_KEY");
  const hook = env("STRIPE_WEBHOOK_SECRET");
  // STRIPE_API_BASE points the adapter at a local double so the full checkout
  // lifecycle can be exercised without keys; unset, it is the real Stripe.
  if (key && hook) return new StripeProvider(key, hook, env("STRIPE_API_BASE") ?? STRIPE_API_BASE);
  return new DevPaymentProvider(hook ?? undefined);
}
