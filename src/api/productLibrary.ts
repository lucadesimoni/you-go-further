import type { Role } from "../auth";
import { CATALOG, mergeCatalog, normalizeProduct, type Product } from "../engine";
import { api, isApiConfigured } from "./client";

/**
 * Client-side access to the admin product library, mirroring feedbackStore's
 * graceful degradation:
 * - with an API configured, the library lives on the server (one curated Swiss
 *   catalog for every athlete);
 * - otherwise custom products fall back to localStorage and merge with the
 *   built-in CATALOG, so the editable library still works in the pure
 *   client-side build.
 *
 * Both paths run the same `normalizeProduct` / `mergeCatalog` as the server, so
 * validation and precedence are identical wherever the code runs.
 */

const KEY = "ygf.products.v1";

function readLocal(): Product[] {
  try {
    const raw = typeof localStorage !== "undefined" ? localStorage.getItem(KEY) : null;
    return raw ? (JSON.parse(raw) as Product[]) : [];
  } catch {
    return [];
  }
}

function writeLocal(list: Product[]): Product[] {
  try {
    if (typeof localStorage !== "undefined") localStorage.setItem(KEY, JSON.stringify(list));
  } catch {
    /* ignore quota / disabled storage */
  }
  return list;
}

export const catalogPersistence = { mode: (): "server" | "local" => (isApiConfigured() ? "server" : "local") };

/** The full merged catalog (built-ins + custom) an athlete browses / gets recommended. */
export async function loadCatalog(): Promise<Product[]> {
  if (isApiConfigured()) return (await api.productsList()).products;
  return mergeCatalog(readLocal());
}

/** Add or edit a custom product. Returns the new merged catalog. */
export async function saveProduct(role: Role, input: Partial<Product>): Promise<Product[]> {
  if (isApiConfigured()) return (await api.productSave(role, input)).products;
  const product = normalizeProduct(input); // throws on invalid — caller shows the message
  const next = [product, ...readLocal().filter((p) => p.id !== product.id)];
  writeLocal(next);
  return mergeCatalog(next);
}

/** Remove a custom product. Built-ins can't be deleted (only overridden). */
export async function deleteProduct(role: Role, id: string): Promise<Product[]> {
  if (isApiConfigured()) return (await api.productDelete(role, id)).products;
  const isBuiltIn = CATALOG.some((p) => p.id === id);
  const local = readLocal();
  if (isBuiltIn && !local.some((p) => p.id === id)) {
    throw new Error("Built-in products can't be deleted — override its values instead.");
  }
  const next = local.filter((p) => p.id !== id);
  writeLocal(next);
  return mergeCatalog(next);
}
