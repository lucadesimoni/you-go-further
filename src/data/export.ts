import type { Activity } from "../model";

/**
 * A sink for streaming normalized activities out to an analytics backend — a
 * data warehouse, lake, or event bus. This is the seam for "big data": the app
 * writes to an {@link ExportSink} and the concrete implementation decides where
 * the rows land (BigQuery streaming insert, S3/Parquet, Kafka, …).
 */
export interface ExportSink {
  readonly name: string;
  write(activities: Activity[]): Promise<void>;
  flush?(): Promise<void>;
}

/** Buffers rows in memory — useful for tests and local inspection. */
export class BufferSink implements ExportSink {
  readonly name = "buffer";
  readonly rows: Activity[] = [];
  async write(activities: Activity[]): Promise<void> {
    this.rows.push(...activities);
  }
}

/** Serializes each activity as one newline-delimited JSON record. */
export function toNdjson(activities: Activity[]): string {
  return activities.map((a) => JSON.stringify(a)).join("\n");
}

/** Flatten activities into rows for a columnar/warehouse load. */
export function toColumnarRows(activities: Activity[]): Record<string, unknown>[] {
  return activities.map((a) => ({
    id: a.id,
    provider: a.provider,
    sport: a.sport,
    start_time: a.startTime,
    duration_sec: a.durationSec,
    distance_m: a.distanceM ?? null,
    elevation_gain_m: a.elevationGainM ?? null,
    avg_hr: a.avgHr ?? null,
    max_hr: a.maxHr ?? null,
    avg_power_w: a.avgPowerW ?? null,
    calories: a.calories ?? null,
    training_load: a.trainingLoad ?? null,
  }));
}
