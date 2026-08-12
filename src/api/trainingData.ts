import type { Activity, ProviderId } from "../model";
import type { ProviderCredential } from "../providers/types";
import { ALL_PROVIDER_IDS, ProviderRegistry } from "../providers";
import { IngestionPipeline, InMemoryActivityStore, lastNDays } from "../data";
import { api, isApiConfigured } from "./client";

/**
 * What this athlete is connected to, and what they have trained.
 *
 * Two questions the whole app asks — Home, Insights, the route screen, Connect —
 * and until now each screen answered them for itself. With a server that was
 * merely repetitive. Without one it was broken, and that is the build a demo
 * runs on:
 *
 * - `api.*` throws "No API configured" when there is no server, so every screen
 *   caught the error and rendered an empty state. The demo showed no sessions,
 *   no week, no insights and no route.
 * - Connect had a local fallback of its own, so connecting Strava *appeared* to
 *   work — until you left the screen. The connection lived in React state and
 *   nothing else, so coming back showed nothing connected, and a reload lost it
 *   again.
 *
 * So the client-side mode gets a real store: connections in `sessionStorage`,
 * activities rebuilt through the same ingestion pipeline the server uses. The
 * generator is seeded on the calendar day, so the sessions a reload produces are
 * *the same sessions* with the same ids — which is what lets "review this run"
 * on Home open that run on the route screen.
 *
 * `sessionStorage`, not `localStorage`: a demo is a sitting, and a demo world
 * that outlives the tab becomes stale data pretending to be an account. Within
 * the tab it survives navigation and reloads, which is what "the demo works"
 * means.
 */

const KEY = "ygf.demo.connections.v1";

/** Where connections and sessions actually live for this deployment. */
export const trainingDataMode = (): "server" | "local" => (isApiConfigured() ? "server" : "local");

function readLocal(): ProviderId[] {
  try {
    const raw = typeof sessionStorage !== "undefined" ? sessionStorage.getItem(KEY) : null;
    const list = raw ? (JSON.parse(raw) as string[]) : [];
    // Filter against the known providers: a stale key from an older build must
    // not put an unknown id into the pipeline.
    return list.filter((id): id is ProviderId => (ALL_PROVIDER_IDS as readonly string[]).includes(id));
  } catch {
    return [];
  }
}

function writeLocal(list: ProviderId[]): ProviderId[] {
  try {
    if (typeof sessionStorage !== "undefined") sessionStorage.setItem(KEY, JSON.stringify(list));
  } catch {
    /* private mode, quota, disabled storage — the session just won't persist */
  }
  cache = null;
  return list;
}

/**
 * The last ingest, kept so four screens asking the same question in one render
 * pass do not each rebuild a hundred sessions. Invalidated whenever the set of
 * connections changes.
 */
let cache: { key: string; activities: Activity[] } | null = null;

export async function loadConnections(): Promise<ProviderId[]> {
  if (isApiConfigured()) {
    try {
      return (await api.connections()).connections.map((c) => c.provider as ProviderId);
    } catch {
      return [];
    }
  }
  return readLocal();
}

/**
 * Connect a provider client-side.
 *
 * There is no consent screen to visit without a server, and inventing one would
 * be theatre. What matters is that the connection is *recorded* where every
 * screen can see it, and that the sessions which follow come through the real
 * pipeline rather than being injected behind it.
 */
export async function connectProvider(id: ProviderId): Promise<ProviderId[]> {
  const next = readLocal();
  if (!next.includes(id)) next.push(id);
  return writeLocal(next);
}

export async function disconnectProvider(id: ProviderId): Promise<ProviderId[]> {
  if (isApiConfigured()) {
    try {
      return (await api.connectionRemove(id)).connections.map((c) => c.provider as ProviderId);
    } catch {
      return loadConnections();
    }
  }
  return writeLocal(readLocal().filter((p) => p !== id));
}

/**
 * Every session this athlete has, newest first.
 *
 * With a server this is the server's list — the one Home, Insights and the route
 * screen must all agree on. Without one it is generated from the connected
 * providers, through `IngestionPipeline`, which is the same path a real import
 * takes: normalisation, de-duplication and ownership included.
 */
export async function loadActivities(historyDays = 120): Promise<Activity[]> {
  if (isApiConfigured()) {
    try {
      return (await api.activities()).activities;
    } catch {
      return [];
    }
  }

  const providers = readLocal();
  const days = Math.min(historyDays, 120);
  const key = `${providers.slice().sort().join(",")}|${days}`;
  if (cache?.key === key) return cache.activities;
  if (providers.length === 0) {
    cache = { key, activities: [] };
    return [];
  }

  const store = new InMemoryActivityStore();
  const pipeline = new IngestionPipeline(new ProviderRegistry(), store);
  const creds: ProviderCredential[] = providers.map((provider) => ({ provider, accessToken: "demo" }));
  await pipeline.ingestAll(creds, lastNDays(days));
  const activities = await store.query();
  cache = { key, activities };
  return activities;
}

/** Test seam: drop the memoised ingest. */
export function __resetTrainingDataCache(): void {
  cache = null;
}
