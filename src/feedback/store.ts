import type { SessionFeedback } from "./feedback";

/**
 * Persistence for session feedback, keyed by user id. Backend-neutral like
 * ActivityStore — the in-memory reference below is swapped for a real database
 * in production so feedback follows the athlete across devices.
 */
export interface FeedbackStore {
  add(userId: string, feedback: SessionFeedback): Promise<SessionFeedback[]>;
  /**
   * Every log on the platform, for cross-athlete aggregates.
   *
   * Only ever consumed by code that reduces a log to an anonymous outcome — a
   * rate band and whether it went badly. Nothing that identifies an athlete
   * leaves the server through this path.
   */
  listAll(): Promise<SessionFeedback[]>;
  list(userId: string): Promise<SessionFeedback[]>;
  clear(userId: string): Promise<void>;
}

export class InMemoryFeedbackStore implements FeedbackStore {
  private readonly byUser = new Map<string, SessionFeedback[]>();

  async listAll(): Promise<SessionFeedback[]> {
    return [...this.byUser.values()].flat();
  }

  async add(userId: string, feedback: SessionFeedback): Promise<SessionFeedback[]> {
    const list = [feedback, ...(this.byUser.get(userId) ?? [])];
    this.byUser.set(userId, list);
    return list;
  }

  async list(userId: string): Promise<SessionFeedback[]> {
    return this.byUser.get(userId) ?? [];
  }

  async clear(userId: string): Promise<void> {
    this.byUser.delete(userId);
  }
}
