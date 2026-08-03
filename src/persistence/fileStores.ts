import { join } from "node:path";
import type { Activity, ProviderId } from "../model";
import type { ActivityQuery, ActivityStore, OwnedActivity } from "../data";
import { matchesQuery, ownedKey, withoutOwner } from "../data";
import type { FeedbackStore, SessionFeedback } from "../feedback";
import type { ConnectionStore, ProviderConnection } from "../providers";
import type { ProviderCredential } from "../providers/types";
import type { Product, ProductStore } from "../engine";
import type { User, UserStore, UserPatch, AthleteProfile, ProfileStore } from "../users";
import { normalizeUserPatch, normalizeProfile, DEFAULT_PROFILE } from "../users";
import type { PlatformSettings, SettingsStore } from "../settings";
import type { AffiliateClick, AffiliateStore, Order, OrderStore } from "../commerce";
import type { MagicLinkStore } from "../auth/magicLink";
import { normalizeSettingsPatch } from "../settings";
import { JsonFile } from "./jsonFile";

/**
 * Durable, file-backed implementations of the store interfaces. Data survives
 * process restarts — the step up from in-memory before a real database. Selected
 * by `storeBackend: "file"` in config; see `pgStores.ts` for Postgres.
 */

export class FileActivityStore implements ActivityStore {
  private readonly file: JsonFile<OwnedActivity[]>;
  private readonly byId: Map<string, OwnedActivity>;

  constructor(dir: string) {
    this.file = new JsonFile(join(dir, "activities.json"), []);
    // Rows written before sessions were owned have no userId; they stay
    // readable and simply belong to nobody.
    this.byId = new Map(this.file.read().map((a) => [ownedKey(a.userId, a.id), a]));
  }

  private flush() {
    this.file.write([...this.byId.values()]);
  }

  async upsert(activities: Activity[], userId?: string): Promise<number> {
    let inserted = 0;
    for (const a of activities) {
      const key = ownedKey(userId, a.id);
      if (!this.byId.has(key)) inserted++;
      this.byId.set(key, userId === undefined ? { ...a } : { ...a, userId });
    }
    this.flush();
    return inserted;
  }

  async query(q: ActivityQuery = {}): Promise<Activity[]> {
    return [...this.byId.values()]
      .filter((a) => matchesQuery(a, q))
      .sort((a, b) => Date.parse(b.startTime) - Date.parse(a.startTime))
      .map(withoutOwner);
  }

  async count(userId?: string): Promise<number> {
    if (userId === undefined) return this.byId.size;
    return [...this.byId.values()].filter((a) => a.userId === userId).length;
  }

  async clear(userId?: string): Promise<void> {
    if (userId === undefined) this.byId.clear();
    else for (const [key, a] of this.byId) if (a.userId === userId) this.byId.delete(key);
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

  async listAll(): Promise<SessionFeedback[]> {
    return Object.values(this.data).flat();
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

export class FileOrderStore implements OrderStore {
  private readonly file: JsonFile<Record<string, Order>>;
  private data: Record<string, Order>;

  constructor(dir: string) {
    this.file = new JsonFile(join(dir, "orders.json"), {});
    this.data = this.file.read();
  }

  async create(order: Order): Promise<Order> {
    this.data[order.id] = order;
    this.file.write(this.data);
    return order;
  }

  async get(id: string): Promise<Order | undefined> {
    return this.data[id];
  }

  async getByProviderRef(ref: string): Promise<Order | undefined> {
    return Object.values(this.data).find((o) => o.providerRef === ref);
  }

  async list(userId: string): Promise<Order[]> {
    return Object.values(this.data)
      .filter((o) => o.userId === userId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async update(
    id: string,
    patch: Partial<Pick<Order, "status" | "providerRef" | "paidAt">>,
  ): Promise<Order | undefined> {
    const cur = this.data[id];
    if (!cur) return undefined;
    const next = { ...cur, ...patch };
    this.data[id] = next;
    this.file.write(this.data);
    return next;
  }
}

export class FileMagicLinkStore implements MagicLinkStore {
  private readonly file: JsonFile<Record<string, number>>;
  private data: Record<string, number>;

  constructor(dir: string) {
    this.file = new JsonFile(join(dir, "magiclinks.json"), {});
    this.data = this.file.read();
  }

  async consume(jti: string, expUnix: number): Promise<boolean> {
    const now = Math.floor(Date.now() / 1000);
    for (const [k, exp] of Object.entries(this.data)) if (exp < now) delete this.data[k];
    if (this.data[jti]) return false;
    this.data[jti] = expUnix;
    this.file.write(this.data);
    return true;
  }
}

export class FileProfileStore implements ProfileStore {
  private readonly file: JsonFile<Record<string, AthleteProfile>>;
  private data: Record<string, AthleteProfile>;

  constructor(dir: string) {
    this.file = new JsonFile(join(dir, "profiles.json"), {});
    this.data = this.file.read();
  }

  async get(userId: string): Promise<AthleteProfile> {
    return this.data[userId] ?? DEFAULT_PROFILE;
  }

  async save(userId: string, patch: Partial<AthleteProfile>): Promise<AthleteProfile> {
    const next = { ...(await this.get(userId)), ...normalizeProfile(patch) };
    this.data[userId] = next;
    this.file.write(this.data);
    return next;
  }
}

export class FileAffiliateStore implements AffiliateStore {
  private readonly file: JsonFile<AffiliateClick[]>;
  private clicks: AffiliateClick[];

  constructor(dir: string) {
    this.file = new JsonFile(join(dir, "affiliate.json"), []);
    this.clicks = this.file.read();
  }

  async record(click: AffiliateClick): Promise<void> {
    this.clicks = [click, ...this.clicks];
    this.file.write(this.clicks);
  }

  async list(userId?: string): Promise<AffiliateClick[]> {
    return userId === undefined ? this.clicks : this.clicks.filter((c) => c.userId === userId);
  }
}
