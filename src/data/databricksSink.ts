import type { Activity } from "../model";
import type { ExportSink } from "./export";
import { toColumnarRows } from "./export";

/**
 * Databricks export sink — streams normalized activities into a Databricks table
 * via the SQL Statement Execution API (`POST /api/2.0/sql/statements`). This is a
 * real "big data" egress: the lakehouse becomes the analytics store of record.
 *
 * Configured from env (server-only secrets): DATABRICKS_HOST, DATABRICKS_TOKEN,
 * DATABRICKS_WAREHOUSE_ID, DATABRICKS_TABLE. When unconfigured it no-ops (dev),
 * counting what it *would* have written so the pipeline still runs.
 */

export interface DatabricksConfig {
  host: string; // e.g. https://dbc-xxxx.cloud.databricks.com
  token: string;
  warehouseId: string;
  table: string; // catalog.schema.activities
}

const COLUMNS = [
  "id",
  "provider",
  "sport",
  "start_time",
  "duration_sec",
  "distance_m",
  "elevation_gain_m",
  "avg_hr",
  "max_hr",
  "avg_power_w",
  "calories",
  "training_load",
] as const;

function sqlLiteral(v: unknown): string {
  if (v === null || v === undefined) return "NULL";
  if (typeof v === "number") return Number.isFinite(v) ? String(v) : "NULL";
  return `'${String(v).replace(/'/g, "''")}'`;
}

/** Build a multi-row INSERT statement for the columnar rows. */
export function buildInsert(table: string, rows: Record<string, unknown>[]): string {
  const values = rows
    .map((r) => `(${COLUMNS.map((c) => sqlLiteral(r[c])).join(", ")})`)
    .join(", ");
  return `INSERT INTO ${table} (${COLUMNS.join(", ")}) VALUES ${values}`;
}

export class DatabricksSink implements ExportSink {
  readonly name = "databricks";
  /** In dev (unconfigured) mode, how many rows would have been written. */
  bufferedRows = 0;

  constructor(
    private readonly cfg: Partial<DatabricksConfig>,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  private configured(): boolean {
    return Boolean(this.cfg.host && this.cfg.token && this.cfg.warehouseId && this.cfg.table);
  }

  async write(activities: Activity[]): Promise<void> {
    if (!activities.length) return;
    if (!this.configured()) {
      this.bufferedRows += activities.length;
      return;
    }
    const statement = buildInsert(this.cfg.table!, toColumnarRows(activities));
    const res = await this.fetchImpl(`${this.cfg.host!.replace(/\/$/, "")}/api/2.0/sql/statements`, {
      method: "POST",
      headers: { Authorization: `Bearer ${this.cfg.token!}`, "content-type": "application/json" },
      body: JSON.stringify({ warehouse_id: this.cfg.warehouseId, statement, wait_timeout: "30s" }),
    });
    if (!res.ok) throw new Error(`Databricks insert failed: HTTP ${res.status}`);
  }
}

const env = (k: string): string | undefined =>
  (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env?.[k];

/** Build a Databricks sink from env, or undefined if not configured. */
export function databricksSinkFromEnv(): DatabricksSink | undefined {
  const host = env("DATABRICKS_HOST");
  const token = env("DATABRICKS_TOKEN");
  const warehouseId = env("DATABRICKS_WAREHOUSE_ID");
  if (!host || !token || !warehouseId) return undefined;
  return new DatabricksSink({ host, token, warehouseId, table: env("DATABRICKS_TABLE") ?? "main.default.activities" });
}
