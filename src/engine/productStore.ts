import { CATALOG } from "./catalog";
import type { Product, ProductCategory, Phase } from "./types";

/**
 * Persistence for the admin-curated custom product library. This is the layer
 * that lets an operator run *their own* Swiss product catalog on top of the
 * built-in brands — add house products, or override a built-in's values. Global
 * (not per-user): one library serves every athlete on the platform, like moov or
 * kaex curating their shop. Backend-neutral, same as the other stores.
 */
export interface ProductStore {
  /** All admin-added / overriding products (does not include built-ins). */
  list(): Promise<Product[]>;
  /** Create or update a custom product by id. Returns the stored product. */
  upsert(product: Product): Promise<Product>;
  /** Remove a custom product by id. */
  remove(id: string): Promise<void>;
}

const CATEGORIES: ProductCategory[] = ["drink-mix", "gel", "bar", "electrolyte", "recovery"];
const PHASES: Phase[] = ["pre", "during", "post"];

/**
 * Validate and normalize an incoming product from the admin UI / API. Enforces
 * the platform's Swiss-only curation and sane nutrition numbers. Throws with a
 * user-facing message on bad input; returns a clean, `custom: true` product.
 */
export function normalizeProduct(input: Partial<Product>): Product {
  const name = (input.name ?? "").trim();
  const brand = (input.brand ?? "").trim();
  if (!name) throw new Error("Product name is required.");
  if (!brand) throw new Error("Brand is required.");
  if (input.swiss === false) throw new Error("Only Swiss-origin products can be added to the library.");
  const category = input.category && CATEGORIES.includes(input.category) ? input.category : "drink-mix";
  const phases = (input.phases ?? []).filter((p): p is Phase => PHASES.includes(p));
  if (phases.length === 0) throw new Error("Pick at least one session phase (pre / during / post).");

  const num = (v: unknown, field: string, min = 0, max = 500): number => {
    const n = Number(v);
    if (!Number.isFinite(n) || n < min || n > max) throw new Error(`${field} must be a number between ${min} and ${max}.`);
    return Math.round(n);
  };

  const id =
    (input.id && input.id.trim()) ||
    `custom-${brand.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`.replace(
      /-+/g,
      "-",
    );

  return {
    id,
    name,
    brand,
    category,
    phases,
    carbsG: num(input.carbsG ?? 0, "Carbs (g)"),
    sodiumMg: num(input.sodiumMg ?? 0, "Sodium (mg)", 0, 2000),
    caffeineMg: input.caffeineMg != null ? num(input.caffeineMg, "Caffeine (mg)", 0, 400) : undefined,
    proteinG: input.proteinG != null ? num(input.proteinG, "Protein (g)") : undefined,
    multiTransportable: Boolean(input.multiTransportable),
    servingLabel: (input.servingLabel ?? "1 serving").trim() || "1 serving",
    priceChf: input.priceChf != null ? Number(Number(input.priceChf).toFixed(2)) : undefined,
    shopUrl: input.shopUrl?.trim() || undefined,
    swiss: true,
    custom: true,
    notes: input.notes?.trim() || undefined,
  };
}

/**
 * Merge the admin library over the built-in catalog. Custom products with the
 * same id override the built-in; new ids are appended. The result is what the
 * recommendation engine and the athlete's product browser both consume.
 */
export function mergeCatalog(custom: Product[], base: Product[] = CATALOG): Product[] {
  const byId = new Map<string, Product>();
  for (const p of base) byId.set(p.id, p);
  for (const p of custom) byId.set(p.id, { ...p, custom: true });
  return [...byId.values()];
}

export class InMemoryProductStore implements ProductStore {
  private readonly byId = new Map<string, Product>();

  async list(): Promise<Product[]> {
    return [...this.byId.values()];
  }

  async upsert(product: Product): Promise<Product> {
    this.byId.set(product.id, product);
    return product;
  }

  async remove(id: string): Promise<void> {
    this.byId.delete(id);
  }
}
