/**
 * Composition root. Wires the concrete implementations selected by
 * {@link AppConfig} into a ready-to-use {@link Runtime}. Nothing else in the app
 * constructs stores, providers, or sinks directly — swapping a backend is a
 * config change, not a code change.
 */

import { getConfig, type AppConfig } from "./config";
import {
  DESCRIPTORS,
  BaseActivityProvider,
  ProviderRegistry,
  StravaProvider,
  GarminProvider,
  PolarProvider,
  SuuntoProvider,
  InMemoryConnectionStore,
} from "./providers";
import type { ActivityProvider, ConnectionStore } from "./providers";
import { InMemoryActivityStore, IngestionPipeline } from "./data";
import type { ActivityStore, ExportSink } from "./data";
import { BufferSink, databricksSinkFromEnv } from "./data";
import { InMemoryFeedbackStore, type FeedbackStore } from "./feedback";
import { InMemoryProductStore, type ProductStore } from "./engine";
import { InMemoryUserStore, seedUsers, type UserStore } from "./users";
import { InMemorySettingsStore, defaultSettings, type SettingsStore } from "./settings";
import {
  FileActivityStore,
  FileFeedbackStore,
  FileConnectionStore,
  FileProductStore,
  FileUserStore,
  FileSettingsStore,
  createPgStores,
} from "./persistence";

export interface Runtime {
  config: AppConfig;
  registry: ProviderRegistry;
  store: ActivityStore;
  feedback: FeedbackStore;
  connections: ConnectionStore;
  products: ProductStore;
  users: UserStore;
  settings: SettingsStore;
  sinks: ExportSink[];
  pipeline: IngestionPipeline;
  /** Run backend initialization (e.g. DB migrations). Called once at startup. */
  init?: () => Promise<void>;
}

interface StoreSet {
  store: ActivityStore;
  feedback: FeedbackStore;
  connections: ConnectionStore;
  products: ProductStore;
  users: UserStore;
  settings: SettingsStore;
  init?: () => Promise<void>;
}

/** Build the store set named by config (memory / file / postgres). */
function createStores(config: AppConfig): StoreSet {
  const settings = defaultSettings(config);
  switch (config.storeBackend) {
    case "file": {
      const dir = config.dataDir;
      return {
        store: new FileActivityStore(dir),
        feedback: new FileFeedbackStore(dir),
        connections: new FileConnectionStore(dir),
        products: new FileProductStore(dir),
        users: new FileUserStore(dir, seedUsers()),
        settings: new FileSettingsStore(dir, settings),
      };
    }
    case "postgres": {
      if (config.databaseUrl) {
        const pg = createPgStores(config.databaseUrl, { users: seedUsers(), settings });
        return {
          store: pg.store,
          feedback: pg.feedback,
          connections: pg.connections,
          products: pg.products,
          users: pg.users,
          settings: pg.settings,
          init: pg.init,
        };
      }
      // No connection string yet — boot on in-memory rather than crash.
      break;
    }
    case "warehouse":
    case "memory":
    default:
      break;
  }
  return {
    store: new InMemoryActivityStore(),
    feedback: new InMemoryFeedbackStore(),
    connections: new InMemoryConnectionStore(),
    products: new InMemoryProductStore(),
    users: new InMemoryUserStore(),
    settings: new InMemorySettingsStore(settings),
  };
}

/** Register only the providers enabled by config (real adapters where available). */
function createRegistry(config: AppConfig): ProviderRegistry {
  const providers: ActivityProvider[] = config.enabledProviders.map((id) => {
    switch (id) {
      case "strava":
        return new StravaProvider();
      case "garmin":
        return new GarminProvider();
      case "polar":
        return new PolarProvider();
      case "suunto":
        return new SuuntoProvider();
      default:
        return new BaseActivityProvider(DESCRIPTORS[id]);
    }
  });
  return new ProviderRegistry(providers);
}

/** Assemble the runtime from a config (defaults to the resolved app config). */
export function createRuntime(config: AppConfig = getConfig()): Runtime {
  const registry = createRegistry(config);
  const { store, feedback, connections, products, users, settings, init } = createStores(config);
  const sinks: ExportSink[] = config.exportEnabled ? [new BufferSink()] : [];
  // Stream to Databricks when configured (big-data egress).
  const dbx = databricksSinkFromEnv();
  if (dbx) sinks.push(dbx);
  const pipeline = new IngestionPipeline(registry, store, sinks);
  return { config, registry, store, feedback, connections, products, users, settings, sinks, pipeline, init };
}
