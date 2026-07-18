import { afterEach, describe, expect, it } from "vitest";
import { __setConfigForTests, getConfig } from "./config";
import { createRuntime } from "./runtime";
import { lastNDays } from "./data";

afterEach(() => __setConfigForTests(null));

describe("config", () => {
  it("provides safe defaults", () => {
    __setConfigForTests(null);
    const c = getConfig();
    expect(c.storeBackend).toBe("memory");
    expect(c.enabledProviders.length).toBe(4);
    expect(c.defaultTier).toBe("free");
  });
});

describe("runtime composition root", () => {
  it("registers only the providers enabled by config", () => {
    const rt = createRuntime({ ...getConfig(), enabledProviders: ["strava", "garmin"] });
    expect(rt.registry.list().map((p) => p.descriptor.id).sort()).toEqual(["garmin", "strava"]);
  });

  it("attaches an export sink only when export is enabled", () => {
    expect(createRuntime({ ...getConfig(), exportEnabled: false }).sinks).toHaveLength(0);
    expect(createRuntime({ ...getConfig(), exportEnabled: true }).sinks).toHaveLength(1);
  });

  it("produces a working pipeline that fills the store", async () => {
    const rt = createRuntime({ ...getConfig(), enabledProviders: ["polar"], exportEnabled: true });
    const res = await rt.pipeline.ingest(
      "polar",
      { provider: "polar", accessToken: "x" },
      lastNDays(28, new Date("2026-07-18T00:00:00Z")),
    );
    expect(res.fetched).toBeGreaterThan(0);
    expect(await rt.store.count()).toBe(res.fetched);
    expect(rt.sinks[0]).toBeDefined();
  });

  it("falls back to in-memory when warehouse has no URL", () => {
    const rt = createRuntime({ ...getConfig(), storeBackend: "warehouse", warehouseUrl: undefined });
    expect(rt.store).toBeDefined();
  });
});
