/**
 * Per-key rate limiting and usage metering.
 *
 * Two jobs that look like one. The limiter protects the engine from a partner's
 * runaway loop; the meter is what a licence is billed on. Both are keyed by the
 * API key, because "which partner" is the only dimension either question cares
 * about.
 *
 * Pure and clock-injectable, so the tests do not sleep.
 *
 * A **token bucket**, not a fixed window: a fixed window lets a caller spend its
 * whole minute's allowance in the last second of one window and again in the
 * first second of the next, which is twice the limit at the moment it matters.
 * The bucket refills continuously, so a burst is bounded by the bucket size and
 * the sustained rate is exactly the limit.
 */

export interface RateDecision {
  allowed: boolean;
  /** Requests left in the bucket right now. */
  remaining: number;
  /** Seconds until the bucket has room again — the `Retry-After` value. */
  retryAfterSec: number;
  limit: number;
}

interface Bucket {
  tokens: number;
  updatedAt: number;
}

export class RateLimiter {
  private buckets = new Map<string, Bucket>();
  /** A minute of idleness is enough to forget a caller and stop growing. */
  private static readonly IDLE_MS = 120_000;

  constructor(private readonly now: () => number = () => Date.now()) {}

  /**
   * Take one token for `id`, allowing `limitPerMin` sustained.
   *
   * The bucket holds a full minute's worth, so a caller may burst up to the
   * limit and then settles to the steady rate.
   */
  take(id: string, limitPerMin: number): RateDecision {
    const limit = Math.max(1, limitPerMin);
    const t = this.now();
    const perMs = limit / 60_000;

    const bucket = this.buckets.get(id) ?? { tokens: limit, updatedAt: t };
    const refilled = Math.min(limit, bucket.tokens + (t - bucket.updatedAt) * perMs);

    if (refilled < 1) {
      // Not enough for one request: say exactly how long until there is.
      const waitMs = (1 - refilled) / perMs;
      this.buckets.set(id, { tokens: refilled, updatedAt: t });
      return { allowed: false, remaining: 0, retryAfterSec: Math.max(1, Math.ceil(waitMs / 1000)), limit };
    }

    this.buckets.set(id, { tokens: refilled - 1, updatedAt: t });
    this.sweep(t);
    return { allowed: true, remaining: Math.floor(refilled - 1), retryAfterSec: 0, limit };
  }

  /** Drop callers that have gone quiet, so an open endpoint cannot grow the map without bound. */
  private sweep(t: number): void {
    if (this.buckets.size < 512) return;
    for (const [id, b] of this.buckets) if (t - b.updatedAt > RateLimiter.IDLE_MS) this.buckets.delete(id);
  }
}

/** One day's calls for one key, by endpoint — the shape an invoice is built from. */
export interface UsageDay {
  date: string;
  keyId: string;
  tenantId: string;
  /** Endpoint → call count. */
  calls: Record<string, number>;
  total: number;
}

/**
 * Usage counted in memory and readable per tenant.
 *
 * Deliberately aggregate: a count per key, per endpoint, per day. Storing the
 * requests themselves would mean holding a partner's athletes' body data to
 * answer a question that is only ever "how many calls" — so it does not.
 */
export class UsageMeter {
  private days = new Map<string, UsageDay>();

  constructor(private readonly now: () => Date = () => new Date()) {}

  record(keyId: string, tenantId: string, endpoint: string): void {
    const date = this.now().toISOString().slice(0, 10);
    const id = `${date}:${keyId}`;
    const day = this.days.get(id) ?? { date, keyId, tenantId, calls: {}, total: 0 };
    day.calls[endpoint] = (day.calls[endpoint] ?? 0) + 1;
    day.total++;
    this.days.set(id, day);
  }

  /** Newest first. `tenantId` scopes it to one licensee. */
  list(tenantId?: string): UsageDay[] {
    const all = [...this.days.values()];
    const scoped = tenantId === undefined ? all : all.filter((d) => d.tenantId === tenantId);
    return scoped.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
  }

  /** Total calls in the last `days` days, for a licence check at a glance. */
  totalFor(tenantId: string, days = 30): number {
    const cutoff = new Date(this.now().getTime() - days * 86_400_000).toISOString().slice(0, 10);
    return this.list(tenantId)
      .filter((d) => d.date >= cutoff)
      .reduce((sum, d) => sum + d.total, 0);
  }
}
