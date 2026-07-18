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

async function call<T>(method: string, path: string, opts: { body?: unknown; role?: Role } = {}): Promise<T> {
  const base = getConfig().apiBaseUrl;
  if (!base) throw new Error("No API configured (running client-side)");
  const res = await fetch(`${base}${path}`, {
    method,
    headers: {
      "content-type": "application/json",
      ...(opts.role ? { "x-role": opts.role } : {}),
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

export const api = {
  health: () => call<HealthResponse>("GET", "/api/health"),
  ingest: (provider: string, days = 28) => call("POST", "/api/ingest", { body: { provider, days } }),
  analysis: (bodyWeightKg = 70) => call("GET", `/api/analysis?bodyWeightKg=${bodyWeightKg}`),
  adminOverview: (role: Role) => call<AdminOverview>("GET", "/api/admin/overview", { role }),
};
