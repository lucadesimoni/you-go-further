import type { Activity, ProviderId } from "../model";
import type { ProviderRegistry } from "../providers";
import type { ProviderCredential, FetchRange } from "../providers/types";
import type { ExportSink } from "./export";
import type { ActivityStore } from "./store";

export interface IngestResult {
  provider: ProviderId;
  fetched: number;
  inserted: number;
  activities: Activity[];
}

/**
 * Orchestrates fetch → normalize → store → export for one provider window.
 * The registry hands back an already-normalized {@link Activity} stream, so the
 * pipeline is provider-agnostic: it dedupes into the store and fans out to any
 * configured export sinks.
 */
export class IngestionPipeline {
  constructor(
    private readonly registry: ProviderRegistry,
    private readonly store: ActivityStore,
    private readonly sinks: ExportSink[] = [],
  ) {}

  async ingest(
    provider: ProviderId,
    credential: ProviderCredential,
    range: FetchRange,
  ): Promise<IngestResult> {
    const activities = await this.registry.get(provider).fetchActivities(credential, range);
    const inserted = await this.store.upsert(activities);
    for (const sink of this.sinks) await sink.write(activities);
    return { provider, fetched: activities.length, inserted, activities };
  }

  /** Ingest several providers concurrently and merge the results. */
  async ingestAll(
    credentials: ProviderCredential[],
    range: FetchRange,
  ): Promise<IngestResult[]> {
    return Promise.all(credentials.map((c) => this.ingest(c.provider, c, range)));
  }
}

/** Convenience: a range covering the last `days` up to now. */
export function lastNDays(days: number, now = new Date()): FetchRange {
  const before = new Date(now);
  const after = new Date(now.getTime() - days * 86_400_000);
  return { after: after.toISOString(), before: before.toISOString() };
}
