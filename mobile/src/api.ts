import type {
  AdaptationInsight,
  AthleteInput,
  AthleteProfile,
  CartLine,
  EnergyRating,
  FuelingSchedule,
  GiRating,
  GuideArticle,
  InsightsResponse,
  Order,
  Product,
  ProviderConnection,
  Recommendation,
  SessionFeedback,
  UsageGuide,
} from "./types";
import { currentToken } from "./session";

/**
 * Client for the You Go Further platform API — the same server the web app uses.
 * Because both clients hit these endpoints, and feedback is persisted per user
 * server-side, the mobile app is genuinely in sync with the web.
 *
 * Base URL comes from EXPO_PUBLIC_API_BASE_URL (or app.json → extra.apiBaseUrl),
 * and can be changed at runtime via setApiBase(). Requests carry the signed
 * session token, so the phone and the web app are the same account.
 */

// Expo injects EXPO_PUBLIC_* env vars at build time; guard the access so this
// file also typechecks and runs where `process` is undefined.
const env = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env;
let base = env?.EXPO_PUBLIC_API_BASE_URL || "http://localhost:8787";

export function setApiBase(url: string) {
  base = url.replace(/\/$/, "");
}
export function getApiBase() {
  return base;
}

type Role = "athlete" | "coach" | "nutritionist" | "admin" | "owner";

async function call<T>(method: string, path: string, opts: { body?: unknown; role?: Role } = {}): Promise<T> {
  // A real signed session takes precedence; x-role is only the demo fallback.
  const token = currentToken();
  const res = await fetch(`${base}${path}`, {
    method,
    headers: {
      "content-type": "application/json",
      ...(token ? { authorization: `Bearer ${token}` } : opts.role ? { "x-role": opts.role } : {}),
    },
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });
  const data = (await res.json()) as T & { error?: string };
  if (!res.ok) throw new Error(data?.error ?? `HTTP ${res.status}`);
  return data;
}

export interface Health {
  status: string;
  environment: string;
  version: string;
  activitiesStored: number;
}

interface FeedbackResponse {
  feedback: SessionFeedback[];
  adaptation: AdaptationInsight;
}

export const api = {
  health: () => call<Health>("GET", "/api/health"),
  recommend: (input: AthleteInput) => call<Recommendation>("POST", "/api/recommend", { body: input }),
  schedule: (input: AthleteInput) => call<FuelingSchedule>("POST", "/api/schedule", { body: input }),
  feedbackList: (role: Role = "athlete") => call<FeedbackResponse>("GET", "/api/feedback", { role }),
  feedbackAdd: (
    entry: { gi: GiRating; energy: EnergyRating; durationMin: number; plannedCarbPerHourG: number },
    role: Role = "athlete",
  ) => call<FeedbackResponse>("POST", "/api/feedback", { body: entry, role }),
  feedbackClear: (role: Role = "athlete") => call<FeedbackResponse>("DELETE", "/api/feedback", { role }),

  // --- Auth (passwordless email link, same as the web app) ---
  emailLinkRequest: (email: string, returnTo = "yougofurther://auth") =>
    call<{ sent: boolean; devLink?: string }>("POST", "/api/auth/email/request", { body: { email, returnTo } }),
  emailLinkVerify: (token: string) =>
    call<{ token: string; account: { id: string; name: string; email: string; role: Role; tier: "free" | "pro" | "elite" } }>(
      "POST",
      "/api/auth/email/verify",
      { body: { token } },
    ),
  me: () => call<{ principal: { id: string; name: string; role: Role; tier: string } }>("GET", "/api/me"),

  // --- Profile (server-synced, so it matches the web app) ---
  profileGet: () => call<{ profile: AthleteProfile }>("GET", "/api/profile"),
  profileSave: (patch: Partial<AthleteProfile>) => call<{ profile: AthleteProfile }>("POST", "/api/profile", { body: patch }),

  // --- Insights: fuelling score + milestones, computed server-side ---
  insights: () => call<InsightsResponse>("GET", "/api/insights"),
  guide: () => call<{ articles: GuideArticle[]; categories: string[]; disclaimer: string }>("GET", "/api/guide"),

  // --- Products & connections ---
  products: () =>
    call<{ products: Product[]; usage: Record<string, UsageGuide>; builtIn: number; custom: number }>(
      "GET",
      "/api/products",
    ),
  connections: () => call<{ connections: ProviderConnection[] }>("GET", "/api/connections"),
  disconnect: (provider: string) => call<{ connections: ProviderConnection[] }>("DELETE", `/api/connections/${provider}`),
  providers: () => call<{ id: string; displayName: string }[]>("GET", "/api/providers"),
  oauthUrl: (provider: string, returnTo: string) =>
    call<{ authorizeUrl: string }>("GET", `/api/oauth/${provider}/authorize-url?return_to=${encodeURIComponent(returnTo)}`),

  // --- Shop ---
  cart: (input: AthleteInput, sessions = 1) =>
    call<{ lines: CartLine[]; subtotalChf: number; itemCount: number }>("POST", "/api/cart", { body: { input, sessions } }),
  checkoutProducts: (lines: CartLine[], returnTo: string) =>
    call<{ orderId: string; url: string; amountChf: number }>("POST", "/api/checkout", {
      body: { kind: "products", lines, returnTo },
    }),
  orders: () => call<{ orders: Order[] }>("GET", "/api/orders"),
};
