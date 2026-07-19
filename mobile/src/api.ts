import type {
  AdaptationInsight,
  AthleteInput,
  EnergyRating,
  FuelingSchedule,
  GiRating,
  Recommendation,
  SessionFeedback,
} from "./types";

/**
 * Client for the You Go Further platform API — the same server the web app uses.
 * Because both clients hit these endpoints, and feedback is persisted per user
 * server-side, the mobile app is genuinely in sync with the web.
 *
 * Base URL comes from EXPO_PUBLIC_API_BASE_URL (or app.json → extra.apiBaseUrl),
 * and can be changed at runtime via setApiBase().
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
  const res = await fetch(`${base}${path}`, {
    method,
    headers: {
      "content-type": "application/json",
      ...(opts.role ? { "x-role": opts.role } : {}),
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
};
