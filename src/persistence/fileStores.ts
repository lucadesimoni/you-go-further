import { join } from "node:path";
import type { Activity, ProviderId } from "../model";
import type { ActivityQuery, ActivityStore } from "../data";
import type { FeedbackStore, SessionFeedback } from "../feedback";
import type { ConnectionStore, ProviderConnection } from "../providers";
import type { ProviderCredential } from "../providers/types";
import type { Product, ProductStore } from "../engine";
import type { User, UserStore, UserPatch } from "../users";
import { normalizeUserPatch } from "../users";
import type { PlatformSettings, SettingsStore } from "../settings";
import { normalizeSettingsPatch } from "../settings";
import { JsonFile } from "./jsonFile";

/**
 * Durable, file-backed implementations of the store interfaces. Data survives
 * process restarts — the step up from in-memory before a real database. Selected
 * by `storeBackend: "file"` in config; see `pgStores.ts` for Postgres.
 */

export class FileActivityStore implements ActivityStore {
  private readonly file: JsonFile<Activity[]>;
  private readonly byId: Map<string, Activity>;

  constructor(dir: string) {
    this.file = new JsonFile(join(dir, "activities.json"), []);
    this.byId = new Map(this.file.read().map((a) => [a.id, a]));
  }

  private flush() {
    this.file.write([...this.byId.values()]);
  }

  async upsert(activities: Activity[]): Promise<number> {
    let inserted = 0;
    for (const a of activities) {
      if (!this.byId.has(a.id)) inserted++;
      this.byId.set(a.id, a);
    }
    this.flush();
    return inserted;
  }

  async query(q: ActivityQuery = {}): Promise<Activity[]> {
    const afterMs = q.after ? Date.parse(q.after) : undefined;
    const beforeMs = q.before ? Date.parse(q.before) : undefined;
    return [...this.byId.values()]
      .filter((a) => {
        if (q.provider && a.provider !== q.provider) return false;
        if (q.sport && a.sport !== q.sport) return false;
        const t = Date.parse(a.startTime);
        if (afterMs !== undefined && t < afterMs) return false;
        if (beforeMs !== undefined && t >= beforeMs) return false;
        return true;
      })
      .sort((a, b) => Date.parse(b.startTime) - Date.parse(a.startTime));
  }

  async count(): Promise<number> {
    return this.byId.size;
  }

  async clear(): Promise<void> {
    this.byId.clear();
    this.flush();
  }
}

export class FileFeedbackStore implements FeedbackStore {
  private readonly file: JsonFile<Record<string, SessionFeedback[]>>;
  private data: Record<string, SessionFeedback[]>;

  constructor(dir: string) {
    this.file = new JsonFile(join(dir, "feedback.json"), {});
    this.data = this.file.read();
  }

  async add(userId: string, feedback: SessionFeedback): Promise<SessionFeedback[]> {
    const list = [feedback, ...(this.data[userId] ?? [])];
    this.data[userId] = list;
    this.file.write(this.data);
    return list;
  }

  async list(userId: string): Promise<SessionFeedback[]> {
    return this.data[userId] ?? [];
  }

  async clear(userId: string): Promise<void> {
    delete this.data[userId];
    this.file.write(this.data);
  }
}

interface StoredConnection {
  cred: ProviderCredential;
  at: string;
}

export class FileConnectionStore implements ConnectionStore {
  private readonly file: JsonFile<Record<string, Record<string, StoredConnection>>>;
  private data: Record<string, Record<string, StoredConnection>>;

  constructor(dir: string) {
    this.file = new JsonFile(join(dir, "connections.json"), {});
    this.data = this.file.read();
  }

  async save(userId: string, credential: ProviderCredential): Promise<void> {
    const forUser = this.data[userId] ?? {};
    forUser[credential.provider] = { cred: credential, at: new Date().toISOString() };
    this.data[userId] = forUser;
    this.file.write(this.data);
  }

  async get(userId: string, provider: ProviderId): Promise<ProviderCredential | undefined> {
    return this.data[userId]?.[provider]?.cred;
  }

  async list(userId: string): Promise<ProviderConnection[]> {
    const forUser = this.data[userId] ?? {};
    return Object.entries(forUser).map(([provider, v]) => ({
      provider: provider as ProviderId,
      athleteId: v.cred.athleteId,
      connectedAt: v.at,
    }));
  }

  async remove(userId: string, provider: ProviderId): Promise<void> {
    if (this.data[userId]) {
      delete this.data[userId][provider];
      this.file.write(this.data);
    }
  }
}

export class FileProductStore implements ProductStore {
  private readonly file: JsonFile<Record<string, Product>>;
  private data: Record<string, Product>;

  constructor(dir: string) {
    this.file = new JsonFile(join(dir, "products.json"), {});
    this.data = this.file.read();
  }

  async list(): Promise<Product[]> {
    return Object.values(this.data);
  }

  async upsert(product: Product): Promise<Product> {
    this.data[product.id] = product;
    this.file.write(this.data);
    return product;
  }

  async remove(id: string): Promise<void> {
    delete this.data[id];
    this.file.write(this.data);
  }
}

export class FileUserStore implements UserStore {
  private readonly file: JsonFile<Record<string, User>>;
  private data: Record<string, User>;

  constructor(dir: string, seed: User[] = []) {
    this.file = new JsonFile(join(dir, "users.json"), {});
    this.data = this.file.read();
    // Seed the org on first run (empty file).
    if (Object.keys(this.data).length === 0 && seed.length) {
      for (const u of seed) this.data[u.id] = u;
      this.file.write(this.data);
    }
  }

  async list(orgId?: string): Promise<User[]> {
    const all = Object.values(this.data).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    return orgId === undefined ? all : all.filter((u) => u.orgId === orgId);
  }

  async get(id: string): Promise<User | undefined> {
    return this.data[id];
  }

  async create(user: User): Promise<User> {
    this.data[user.id] = user;
    this.file.write(this.data);
    return user;
  }

  async update(id: string, patch: UserPatch): Promise<User | undefined> {
    const cur = this.data[id];
    if (!cur) return undefined;
    const next = { ...cur, ...normalizeUserPatch(patch) };
    this.data[id] = next;
    this.file.write(this.data);
    return next;
  }

  async remove(id: string): Promise<void> {
    delete this.data[id];
    this.file.write(this.data);
  }
}

export class FileSettingsStore implements SettingsStore {
  private readonly file: JsonFile<PlatformSettings>;
  private settings: PlatformSettings;

  constructor(dir: string, defaults: PlatformSettings) {
    this.file = new JsonFile(join(dir, "settings.json"), defaults);
    this.settings = { ...defaults, ...this.file.read() };
  }

  async get(): Promise<PlatformSettings> {
    return this.settings;
  }

  async update(patch: Partial<PlatformSettings>): Promise<PlatformSettings> {
    this.settings = { ...this.settings, ...normalizeSettingsPatch(patch) };
    this.file.write(this.settings);
    return this.settings;
  }
}
