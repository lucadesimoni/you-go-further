import type { AffiliateClick } from "./affiliate";

/**
 * Where hand-offs to a partner shop are recorded.
 *
 * This is the ledger the whole Phase-1 business model rests on: when a partner
 * sends a commission statement, these rows are what it gets reconciled against.
 * Backend-neutral like every other store — in-memory for tests and the demo,
 * file-backed for a small deployment, Postgres in production.
 */
export interface AffiliateStore {
  record(click: AffiliateClick): Promise<void>;
  /** Every click, newest first. `userId` scopes it to one athlete. */
  list(userId?: string): Promise<AffiliateClick[]>;
}

export class InMemoryAffiliateStore implements AffiliateStore {
  private clicks: AffiliateClick[] = [];

  async record(click: AffiliateClick): Promise<void> {
    this.clicks = [click, ...this.clicks];
  }

  async list(userId?: string): Promise<AffiliateClick[]> {
    return userId === undefined ? this.clicks : this.clicks.filter((c) => c.userId === userId);
  }
}
