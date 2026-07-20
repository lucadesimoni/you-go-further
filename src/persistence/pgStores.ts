import { Pool } from "pg";
import type { Activity, ProviderId } from "../model";
import type { ActivityQuery, ActivityStore } from "../data";
import type { FeedbackStore, SessionFeedback } from "../feedback";
import type { ConnectionStore, ProviderConnection } from "../providers";
import type { ProviderCredential } from "../providers/types";
import type { Product, ProductStore } from "../engine";

/**
 * PostgreSQL-backed stores — the production persistence backend. Selected by
 * `storeBackend: "postgres"` / a `DATABASE_URL`. Activities and feedback are held
 * as JSONB with a few indexed columns for filtering; provider credentials are
 * per (user, provider). Run {@link migrate} once at startup. A local Postgres is
 * provided via `docker-compose.yml`.
 */

export async function migrate(pool: Pool): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS activities (
      id          text PRIMARY KEY,
      provider    text NOT NULL,
      sport       text NOT NULL,
      start_time  timestamptz NOT NULL,
      data        jsonb NOT NULL
    );
    CREATE INDEX IF NOT EXISTS activities_start_idx ON activities (start_time DESC);
    CREATE INDEX IF NOT EXISTS activities_provider_idx ON activities (provider);

    CREATE TABLE IF NOT EXISTS feedback (
      id       text PRIMARY KEY,
      user_id  text NOT NULL,
      date     timestamptz NOT NULL,
      data     jsonb NOT NULL
    );
    CREATE INDEX IF NOT EXISTS feedback_user_idx ON feedback (user_id, date DESC);

    CREATE TABLE IF NOT EXISTS connections (
      user_id      text NOT NULL,
      provider     text NOT NULL,
      cred         jsonb NOT NULL,
      connected_at timestamptz NOT NULL,
      PRIMARY KEY (user_id, provider)
    );

    CREATE TABLE IF NOT EXISTS products (
      id          text PRIMARY KEY,
      data        jsonb NOT NULL,
      updated_at  timestamptz NOT NULL DEFAULT now()
    );
  `);
}

export class PgActivityStore implements ActivityStore {
  constructor(private readonly pool: Pool) {}

  async upsert(activities: Activity[]): Promise<number> {
    let inserted = 0;
    for (const a of activities) {
      const res = await this.pool.query<{ inserted: boolean }>(
        `INSERT INTO activities (id, provider, sport, start_time, data)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data, start_time = EXCLUDED.start_time
         RETURNING (xmax = 0) AS inserted`,
        [a.id, a.provider, a.sport, a.startTime, a],
      );
      if (res.rows[0]?.inserted) inserted++;
    }
    return inserted;
  }

  async query(q: ActivityQuery = {}): Promise<Activity[]> {
    const res = await this.pool.query<{ data: Activity }>(
      `SELECT data FROM activities
       WHERE ($1::text IS NULL OR provider = $1)
         AND ($2::text IS NULL OR sport = $2)
         AND ($3::timestamptz IS NULL OR start_time >= $3)
         AND ($4::timestamptz IS NULL OR start_time < $4)
       ORDER BY start_time DESC`,
      [q.provider ?? null, q.sport ?? null, q.after ?? null, q.before ?? null],
    );
    return res.rows.map((r) => r.data);
  }

  async count(): Promise<number> {
    const res = await this.pool.query<{ count: string }>("SELECT count(*)::int AS count FROM activities");
    return Number(res.rows[0]?.count ?? 0);
  }

  async clear(): Promise<void> {
    await this.pool.query("DELETE FROM activities");
  }
}

export class PgFeedbackStore implements FeedbackStore {
  constructor(private readonly pool: Pool) {}

  async add(userId: string, feedback: SessionFeedback): Promise<SessionFeedback[]> {
    await this.pool.query(
      `INSERT INTO feedback (id, user_id, date, data) VALUES ($1, $2, $3, $4)
       ON CONFLICT (id) DO NOTHING`,
      [feedback.id, userId, feedback.date, feedback],
    );
    return this.list(userId);
  }

  async list(userId: string): Promise<SessionFeedback[]> {
    const res = await this.pool.query<{ data: SessionFeedback }>(
      "SELECT data FROM feedback WHERE user_id = $1 ORDER BY date DESC",
      [userId],
    );
    return res.rows.map((r) => r.data);
  }

  async clear(userId: string): Promise<void> {
    await this.pool.query("DELETE FROM feedback WHERE user_id = $1", [userId]);
  }
}

export class PgConnectionStore implements ConnectionStore {
  constructor(private readonly pool: Pool) {}

  async save(userId: string, credential: ProviderCredential): Promise<void> {
    await this.pool.query(
      `INSERT INTO connections (user_id, provider, cred, connected_at)
       VALUES ($1, $2, $3, now())
       ON CONFLICT (user_id, provider) DO UPDATE SET cred = EXCLUDED.cred, connected_at = now()`,
      [userId, credential.provider, credential],
    );
  }

  async get(userId: string, provider: ProviderId): Promise<ProviderCredential | undefined> {
    const res = await this.pool.query<{ cred: ProviderCredential }>(
      "SELECT cred FROM connections WHERE user_id = $1 AND provider = $2",
      [userId, provider],
    );
    return res.rows[0]?.cred;
  }

  async list(userId: string): Promise<ProviderConnection[]> {
    const res = await this.pool.query<{ provider: ProviderId; cred: ProviderCredential; connected_at: Date }>(
      "SELECT provider, cred, connected_at FROM connections WHERE user_id = $1",
      [userId],
    );
    return res.rows.map((r) => ({
      provider: r.provider,
      athleteId: r.cred.athleteId,
      connectedAt: new Date(r.connected_at).toISOString(),
    }));
  }

  async remove(userId: string, provider: ProviderId): Promise<void> {
    await this.pool.query("DELETE FROM connections WHERE user_id = $1 AND provider = $2", [userId, provider]);
  }
}

export class PgProductStore implements ProductStore {
  constructor(private readonly pool: Pool) {}

  async list(): Promise<Product[]> {
    const res = await this.pool.query<{ data: Product }>("SELECT data FROM products ORDER BY updated_at DESC");
    return res.rows.map((r) => r.data);
  }

  async upsert(product: Product): Promise<Product> {
    await this.pool.query(
      `INSERT INTO products (id, data, updated_at) VALUES ($1, $2, now())
       ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data, updated_at = now()`,
      [product.id, product],
    );
    return product;
  }

  async remove(id: string): Promise<void> {
    await this.pool.query("DELETE FROM products WHERE id = $1", [id]);
  }
}

export interface PgStores {
  pool: Pool;
  store: PgActivityStore;
  feedback: PgFeedbackStore;
  connections: PgConnectionStore;
  products: PgProductStore;
  init(): Promise<void>;
}

/** Construct Postgres-backed stores from a connection string. */
export function createPgStores(databaseUrl: string): PgStores {
  const pool = new Pool({ connectionString: databaseUrl });
  return {
    pool,
    store: new PgActivityStore(pool),
    feedback: new PgFeedbackStore(pool),
    connections: new PgConnectionStore(pool),
    products: new PgProductStore(pool),
    init: () => migrate(pool),
  };
}
