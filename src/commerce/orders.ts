import type { Tier } from "../subscription";
import type { CartLine } from "./cart";

/**
 * Orders — the record of what an athlete actually bought, for both one-off
 * product carts and subscription upgrades. An order is created *pending* when
 * checkout starts and only becomes *paid* when the payment provider confirms it
 * via webhook, so the server never trusts the client for money.
 */
export type OrderKind = "products" | "subscription";
export type OrderStatus = "pending" | "paid" | "failed" | "cancelled";

export interface Order {
  id: string;
  userId: string;
  kind: OrderKind;
  status: OrderStatus;
  /** Product lines (empty for a subscription order). */
  lines: CartLine[];
  /** Tier being purchased, for subscription orders. */
  tier?: Tier;
  amountChf: number;
  currency: "CHF";
  /** The payment provider's session/intent id, used to reconcile webhooks. */
  providerRef?: string;
  createdAt: string;
  paidAt?: string;
}

export interface OrderStore {
  create(order: Order): Promise<Order>;
  get(id: string): Promise<Order | undefined>;
  /** Look up by the payment provider's reference (webhook reconciliation). */
  getByProviderRef(ref: string): Promise<Order | undefined>;
  list(userId: string): Promise<Order[]>;
  update(id: string, patch: Partial<Pick<Order, "status" | "providerRef" | "paidAt">>): Promise<Order | undefined>;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Build a pending product order from cart lines. */
export function newProductOrder(userId: string, lines: CartLine[]): Order {
  const amountChf = round2(lines.reduce((s, l) => s + l.lineTotalChf, 0));
  return {
    id: `ord_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
    userId,
    kind: "products",
    status: "pending",
    lines,
    amountChf,
    currency: "CHF",
    createdAt: new Date().toISOString(),
  };
}

/** Build a pending subscription order for a tier at a monthly price. */
export function newSubscriptionOrder(userId: string, tier: Tier, amountChf: number): Order {
  return {
    id: `ord_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
    userId,
    kind: "subscription",
    status: "pending",
    lines: [],
    tier,
    amountChf,
    currency: "CHF",
    createdAt: new Date().toISOString(),
  };
}

export class InMemoryOrderStore implements OrderStore {
  private readonly byId = new Map<string, Order>();

  async create(order: Order): Promise<Order> {
    this.byId.set(order.id, order);
    return order;
  }

  async get(id: string): Promise<Order | undefined> {
    return this.byId.get(id);
  }

  async getByProviderRef(ref: string): Promise<Order | undefined> {
    return [...this.byId.values()].find((o) => o.providerRef === ref);
  }

  async list(userId: string): Promise<Order[]> {
    return [...this.byId.values()]
      .filter((o) => o.userId === userId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async update(id: string, patch: Partial<Pick<Order, "status" | "providerRef" | "paidAt">>): Promise<Order | undefined> {
    const cur = this.byId.get(id);
    if (!cur) return undefined;
    const next = { ...cur, ...patch };
    this.byId.set(id, next);
    return next;
  }
}
