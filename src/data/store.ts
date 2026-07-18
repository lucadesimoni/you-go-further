import type { Activity, ProviderId, SportType } from "../model";

export interface ActivityQuery {
  provider?: ProviderId;
  sport?: SportType;
  /** ISO-8601 inclusive lower bound on startTime. */
  after?: string;
  /** ISO-8601 exclusive upper bound on startTime. */
  before?: string;
}

/**
 * Storage abstraction for normalized activities. The interface is intentionally
 * backend-neutral: the in-memory implementation below is fine for the app and
 * tests, while a production deployment swaps in a warehouse/lake-backed
 * implementation (BigQuery, ClickHouse, Postgres, …) with the same contract.
 */
export interface ActivityStore {
  /** Insert or replace by `Activity.id`. Returns how many were newly inserted. */
  upsert(activities: Activity[]): Promise<number>;
  query(q?: ActivityQuery): Promise<Activity[]>;
  count(): Promise<number>;
  clear(): Promise<void>;
}

/** Reference in-memory store. De-duplicates on `Activity.id`. */
export class InMemoryActivityStore implements ActivityStore {
  private readonly byId = new Map<string, Activity>();

  async upsert(activities: Activity[]): Promise<number> {
    let inserted = 0;
    for (const a of activities) {
      if (!this.byId.has(a.id)) inserted++;
      this.byId.set(a.id, a);
    }
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
  }
}
