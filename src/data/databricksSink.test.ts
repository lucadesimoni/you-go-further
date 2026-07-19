import { describe, expect, it, vi } from "vitest";
import { buildInsert, DatabricksSink } from "./databricksSink";
import type { Activity } from "../model";

const act = (id: string): Activity => ({
  id: `strava:${id}`,
  provider: "strava",
  externalId: id,
  sport: "ride",
  startTime: "2026-07-10T06:00:00Z",
  durationSec: 3600,
  distanceM: 30000,
  avgHr: 142,
});

describe("buildInsert", () => {
  it("builds a multi-row INSERT and escapes strings", () => {
    const sql = buildInsert("main.default.activities", [
      { id: "a'b", provider: "strava", sport: "ride", start_time: "2026-07-10", duration_sec: 60, distance_m: null, avg_hr: 140 },
    ]);
    expect(sql).toContain("INSERT INTO main.default.activities");
    expect(sql).toContain("'a''b'"); // escaped quote
    expect(sql).toContain("NULL"); // null distance
  });
});

describe("DatabricksSink", () => {
  it("no-ops (buffers) when unconfigured", async () => {
    const sink = new DatabricksSink({});
    await sink.write([act("1"), act("2")]);
    expect(sink.bufferedRows).toBe(2);
  });

  it("POSTs an INSERT to the SQL Statement Execution API when configured", async () => {
    const fetchImpl = vi.fn(async (url: string, init?: RequestInit) => {
      expect(String(url)).toBe("https://dbc-x.cloud.databricks.com/api/2.0/sql/statements");
      const bodyStr = String(init?.body);
      const body = JSON.parse(bodyStr) as { warehouse_id: string; statement: string };
      expect(body.warehouse_id).toBe("wh-1");
      expect(body.statement).toContain("INSERT INTO cat.sch.activities");
      expect(body.statement).toContain("strava:1");
      expect((init?.headers as Record<string, string>).Authorization).toBe("Bearer tok");
      return new Response(JSON.stringify({ status: { state: "SUCCEEDED" } }), { status: 200 });
    }) as unknown as typeof fetch;

    const sink = new DatabricksSink(
      { host: "https://dbc-x.cloud.databricks.com", token: "tok", warehouseId: "wh-1", table: "cat.sch.activities" },
      fetchImpl,
    );
    await sink.write([act("1")]);
    expect(fetchImpl).toHaveBeenCalledOnce();
  });

  it("throws on a non-OK Databricks response", async () => {
    const fetchImpl = vi.fn(async () => new Response("nope", { status: 403 })) as unknown as typeof fetch;
    const sink = new DatabricksSink(
      { host: "https://h", token: "t", warehouseId: "w", table: "t.t.t" },
      fetchImpl,
    );
    await expect(sink.write([act("1")])).rejects.toThrow(/Databricks insert failed/);
  });
});
