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
  activeSeats?: number;
  members: { id: string; name: string; role: string; tier: string }[];
  settings?: PlatformSettings;
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
import type { User, NewUser, UserPatch, AthleteProfile } from "../users";
import type { PlatformSettings } from "../settings";
import type { AffiliateSummary, CartLine, Order, OutboundLink, PartnerProgram } from "../commerce";
import type { Activity } from "../model";
import type { BandStat, CohortPrior, LoadProfile } from "../analysis";
import type { Tier } from "../subscription";

export interface CheckoutResponse {
  orderId: string;
  url: string;
  provider: string;
  amountChf: number;
}
export interface EmailRequestResponse {
  sent: boolean;
  devLink?: string;
}
export interface EmailVerifyResponse {
  token: string;
  account: { id: string; name: string; email: string; role: Role; tier: Tier };
}

export interface UsersResponse {
  users: User[];
}
export interface SettingsResponse {
  settings: PlatformSettings;
}

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
  /** The synced session this log belongs to — what lets it be debriefed later. */
  activityId?: string;
  /** What the athlete actually took, when they know it. */
  actualCarbPerHourG?: number;
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
  usersList: (role: Role) => call<UsersResponse>("GET", "/api/admin/users", { role }),
  userCreate: (role: Role, body: NewUser) => call<UsersResponse>("POST", "/api/admin/users", { body, role }),
  userUpdate: (role: Role, id: string, body: UserPatch) =>
    call<UsersResponse>("POST", `/api/admin/users/${encodeURIComponent(id)}`, { body, role }),
  userDelete: (role: Role, id: string) =>
    call<UsersResponse>("DELETE", `/api/admin/users/${encodeURIComponent(id)}`, { role }),
  settingsGet: (role: Role) => call<SettingsResponse>("GET", "/api/admin/settings", { role }),
  settingsUpdate: (role: Role, body: Partial<PlatformSettings>) =>
    call<SettingsResponse>("POST", "/api/admin/settings", { body, role }),
  checkoutProducts: (lines: CartLine[], returnTo: string) =>
    call<CheckoutResponse>("POST", "/api/checkout", { body: { kind: "products", lines, returnTo } }),
  checkoutSubscription: (tier: Tier, returnTo: string) =>
    call<CheckoutResponse>("POST", "/api/checkout", { body: { kind: "subscription", tier, returnTo } }),
  orders: () => call<{ orders: Order[] }>("GET", "/api/orders"),
  profileGet: () => call<{ profile: AthleteProfile }>("GET", "/api/profile"),
  profileSave: (patch: Partial<AthleteProfile>) => call<{ profile: AthleteProfile }>("POST", "/api/profile", { body: patch }),
  activities: (limit = 500) => call<{ count: number; activities: Activity[] }>("GET", `/api/activities?limit=${limit}`),
  /**
   * Start a provider connect. It is fetched (not navigated to) on purpose: this
   * call carries the session, so the `state` it returns is bound to the athlete
   * and whatever comes back from the provider lands on *their* account.
   */
  oauthAuthorizeUrl: (provider: string, returnTo: string) =>
    call<{ authorizeUrl: string; configured: boolean; live: boolean; state: string }>(
      "GET",
      `/api/oauth/${provider}/authorize-url?return_to=${encodeURIComponent(returnTo)}`,
    ),
  /** Fitness / fatigue / form, computed server-side from the same session load. */
  load: () => call<LoadProfile & { flags: { id: string; severity: string; text: string }[] }>("GET", "/api/load"),
  /** What usually happens at a carbohydrate rate, pooled anonymously. */
  cohort: (carbPerHourG?: number) =>
    call<{ bands: BandStat[]; total: number; prior?: CohortPrior }>(
      "GET",
      `/api/cohort${carbPerHourG !== undefined ? `?carbPerHourG=${carbPerHourG}` : ""}`,
    ),
  connections: () => call<{ connections: { provider: string }[] }>("GET", "/api/connections"),
  /** Outbound partner links for a cart — built server-side, where the ids live. */
  affiliateLinks: (lines: CartLine[]) =>
    call<{ links: OutboundLink[]; partnered: boolean }>("POST", "/api/affiliate/links", { body: { lines } }),
  /** Record a hand-off to a partner shop, so commission can be reconciled. */
  affiliateClick: (body: { productId: string; brand: string; valueChf: number }) =>
    call<{ recorded: boolean; tracked: boolean }>("POST", "/api/affiliate/click", { body }),
  affiliateSummary: (role: Role) =>
    call<{ summary: AffiliateSummary; partners: PartnerProgram[] }>("GET", "/api/affiliate/summary", { role }),
  connectionRemove: (provider: string) => call<{ connections: { provider: string }[] }>("DELETE", `/api/connections/${provider}`),
  emailLinkRequest: (email: string, returnTo: string) =>
    call<EmailRequestResponse>("POST", "/api/auth/email/request", { body: { email, returnTo } }),
  emailLinkVerify: (token: string) =>
    call<EmailVerifyResponse>("POST", "/api/auth/email/verify", { body: { token } }),
  /** Everything the platform holds about the signed-in athlete. Never gated. */
  exportMyData: () => call<Record<string, unknown>>("GET", "/api/me/export"),
  /** Erase the account and the data attached to it. */
  deleteMe: () =>
    call<{ deleted: Record<string, number | boolean>; retained: { orders: number; reason: string } }>(
      "DELETE",
      "/api/me",
    ),
  /** Who the server thinks you are *now* — including a tier bought since sign-in. */
  me: () => call<{ principal: { id: string; name: string; role: Role; tier: Tier } }>("GET", "/api/me"),
};
