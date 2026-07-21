import { getConfig } from "../config";
import type { Role } from "../auth";

/**
 * Browser API client. When `config.apiBaseUrl` is set, the app talks to the real
 * server (src/api/handlers via server/index.ts); otherwise the app runs fully
 * client-side against the same modules. `isApiConfigured()` lets the UI adapt.
 */

export function isApiConfigured(): boolean {
  return Boolean(getConfig().apiBaseUrl);
}

// --- Session token (real signed session from the server) ---
const TOKEN_KEY = "ygf.token.v1";
export function getSessionToken(): string | null {
  try {
    return typeof localStorage !== "undefined" ? localStorage.getItem(TOKEN_KEY) : null;
  } catch {
    return null;
  }
}
export function setSessionToken(token: string): void {
  try {
    localStorage.setItem(TOKEN_KEY, token);
  } catch {
    /* ignore */
  }
}
export function clearSessionToken(): void {
  try {
    localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* ignore */
  }
}

async function call<T>(method: string, path: string, opts: { body?: unknown; role?: Role } = {}): Promise<T> {
  const base = getConfig().apiBaseUrl;
  if (!base) throw new Error("No API configured (running client-side)");
  const token = getSessionToken();
  const res = await fetch(`${base}${path}`, {
    method,
    headers: {
      "content-type": "application/json",
      // A real signed session takes precedence; x-role is the demo fallback.
      ...(token ? { authorization: `Bearer ${token}` } : opts.role ? { "x-role": opts.role } : {}),
    },
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });
  const data = (await res.json()) as T;
  if (!res.ok) throw new Error((data as { error?: string })?.error ?? `HTTP ${res.status}`);
  return data;
}

export interface HealthResponse {
  status: string;
  environment: string;
  version: string;
  storeBackend: string;
  activitiesStored: number;
}

export interface AdminOverview {
  org: string | null;
  seats: number;
  members: { id: string; name: string; role: string; tier: string }[];
  deployment: {
    environment: string;
    version: string;
    storeBackend: string;
    enabledProviders: string[];
    activitiesStored: number;
  };
}

import type { SessionFeedback } from "../feedback";
import type { Product } from "../engine";

interface FeedbackResponse {
  feedback: SessionFeedback[];
}

export interface ProductsResponse {
  products: Product[];
  builtIn?: number;
  custom?: number;
}

export interface NewFeedback {
  gi: SessionFeedback["gi"];
  energy: SessionFeedback["energy"];
  durationMin: number;
  plannedCarbPerHourG: number;
}

export const api = {
  health: () => call<HealthResponse>("GET", "/api/health"),
  ingest: (provider: string, days = 28) => call("POST", "/api/ingest", { body: { provider, days } }),
  analysis: (bodyWeightKg = 70) => call("GET", `/api/analysis?bodyWeightKg=${bodyWeightKg}`),
  adminOverview: (role: Role) => call<AdminOverview>("GET", "/api/admin/overview", { role }),
  feedbackList: (role: Role) => call<FeedbackResponse>("GET", "/api/feedback", { role }),
  feedbackAdd: (role: Role, body: NewFeedback) => call<FeedbackResponse>("POST", "/api/feedback", { body, role }),
  feedbackClear: (role: Role) => call<FeedbackResponse>("DELETE", "/api/feedback", { role }),
  googleSignIn: (idToken: string) => call<{ token: string }>("POST", "/api/auth/google", { body: { idToken } }),
  appleSignIn: (idToken: string, name?: string) =>
    call<{ token: string }>("POST", "/api/auth/apple", { body: { idToken, name } }),
  offering: (input: unknown) => call("POST", "/api/offering", { body: input }),
  productsList: () => call<ProductsResponse>("GET", "/api/products"),
  productSave: (role: Role, product: Partial<Product>) =>
    call<{ product: Product; products: Product[] }>("POST", "/api/products", { body: product, role }),
  productDelete: (role: Role, id: string) =>
    call<ProductsResponse>("DELETE", `/api/products/${encodeURIComponent(id)}`, { role }),
};
