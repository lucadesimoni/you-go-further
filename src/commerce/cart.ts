import type { Product, Recommendation } from "../engine";

/**
 * Turn a recommendation into a shoppable cart — the step that connects advice to
 * fulfilment. Quantities are derived from the plan (enough servings to hit the
 * carbohydrate total, one of each pre/post item), multiplied by how many sessions
 * the athlete is buying for.
 */

export interface CartLine {
  productId: string;
  name: string;
  brand: string;
  qty: number;
  unitPriceChf: number;
  lineTotalChf: number;
}

export interface Cart {
  sessions: number;
  lines: CartLine[];
  subtotalChf: number;
  itemCount: number;
}

/** Servings of one product needed for a single session under this plan. */
function servingsPerSession(product: Product, rec: Recommendation): number {
  const hours = Math.max(1, Math.round(rec.input.durationMin / 60));
  const carbTotal = rec.target.carbTotalG;
  if (product.phases.includes("during")) {
    if (product.category === "drink-mix" && product.carbsG > 0) {
      return Math.max(1, Math.ceil(carbTotal / product.carbsG));
    }
    if (product.category === "gel" && product.carbsG > 0) {
      return Math.max(1, Math.ceil(carbTotal / (2 * product.carbsG)));
    }
    if (product.category === "electrolyte") return hours;
  }
  return 1; // pre / post items: one serving
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Build a cart from a recommendation for `sessions` sessions (default 1). */
export function buildCart(rec: Recommendation, sessions = 1): Cart {
  const qtyById = new Map<string, { product: Product; qty: number }>();
  for (const phase of rec.phases) {
    for (const product of phase.products) {
      const per = servingsPerSession(product, rec);
      const existing = qtyById.get(product.id);
      // A product can appear in multiple phases; keep the larger requirement.
      if (existing) existing.qty = Math.max(existing.qty, per);
      else qtyById.set(product.id, { product, qty: per });
    }
  }

  const lines: CartLine[] = [...qtyById.values()].map(({ product, qty }) => {
    const totalQty = qty * sessions;
    const unit = product.priceChf ?? 0;
    return {
      productId: product.id,
      name: product.name,
      brand: product.brand,
      qty: totalQty,
      unitPriceChf: unit,
      lineTotalChf: round2(unit * totalQty),
    };
  });

  lines.sort((a, b) => b.lineTotalChf - a.lineTotalChf);
  return {
    sessions,
    lines,
    subtotalChf: round2(lines.reduce((s, l) => s + l.lineTotalChf, 0)),
    itemCount: lines.reduce((s, l) => s + l.qty, 0),
  };
}
