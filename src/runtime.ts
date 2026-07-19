/**
 * Composition root. Wires the concrete implementations selected by
 * {@link AppConfig} into a ready-to-use {@link Runtime}. Nothing else in the app
 * constructs stores, providers, or sinks directly — swapping a backend is a
 * config change, not a code change.
 */

import { getConfig, type AppConfig } from "./config";
import { DESCRIPTORS, BaseActivityProvider, ProviderRegistry, StravaProvider, InMemoryConnectionStore } from "./providers";
import type { ActivityProvider, ConnectionStore } from "./providers";
import { InMemoryActivityStore, IngestionPipeline } from "./data";
import type { ActivityStore, ExportSink } from "./data";
import { BufferSink } from "./data";
import { InMemoryFeedbackStore, type FeedbackStore } from "./feedback";

export interface Runtime {
  config: AppConfig;
  registry: ProviderRegistry;
  store: ActivityStore;
  feedback: FeedbackStore;
  connections: ConnectionStore;
  sinks: ExportSink[];
  pipeline: IngestionPipeline;
}

/** Build the store implementation named by config. */
function createStore(config: AppConfig): ActivityStore {
  switch (config.storeBackend) {
    case "warehouse":
      // Real warehouse adapters (BigQuery/ClickHouse/Postgres) implement
      // ActivityStore and are constructed from config.warehouseUrl. Until one is
      // wired, fall back to in-memory so the app still boots.
      if (!config.warehouseUrl) return new InMemoryActivityStore();
      return new InMemoryActivityStore();
    case "memory":
    default:
      return new InMemoryActivityStore();
  }
}

/** Register only the providers enabled by config (real adapter for Strava). */
function createRegistry(config: AppConfig): ProviderRegistry {
  const providers: ActivityProvider[] = config.enabledProviders.map((id) =>
    id === "strava" ? new StravaProvider() : new BaseActivityProvider(DESCRIPTORS[id]),
  );
  return new ProviderRegistry(providers);
}

/** Assemble the runtime from a config (defaults to the resolved app config). */
export function createRuntime(config: AppConfig = getConfig()): Runtime {
  const registry = createRegistry(config);
  const store = createStore(config);
  const sinks: ExportSink[] = config.exportEnabled ? [new BufferSink()] : [];
  const pipeline = new IngestionPipeline(registry, store, sinks);
  const feedback = new InMemoryFeedbackStore();
  const connections = new InMemoryConnectionStore();
  return { config, registry, store, feedback, connections, sinks, pipeline };
}
