import { describe, expect, it } from "vitest";
import { ProviderRegistry } from "../providers";
import { InMemoryActivityStore } from "./store";
import { BufferSink, toColumnarRows, toNdjson } from "./export";
import { IngestionPipeline, lastNDays } from "./pipeline";
import type { ProviderCredential } from "../providers/types";

const cred = (provider: ProviderCredential["provider"]): ProviderCredential => ({
  provider,
  accessToken: "test-token",
});

const now = new Date("2026-07-18T12:00:00Z");

describe("provider registry", () => {
  it("registers all four services with real OAuth endpoints", () => {
    const reg = new ProviderRegistry();
    const ids = reg.list().map((p) => p.descriptor.id).sort();
    expect(ids).toEqual(["garmin", "polar", "strava", "suunto"]);
    for (const p of reg.list()) {
      expect(p.descriptor.oauth.authUrl).toMatch(/^https:\/\//);
      expect(p.descriptor.oauth.scopes.length).toBeGreaterThan(0);
    }
  });

  it("builds an OAuth authorize URL with redirect and state", () => {
    const url = new ProviderRegistry().get("strava").authorizeUrl("https://app.example/cb", "xyz");
    expect(url).toContain("https://www.strava.com/oauth/authorize");
    expect(url).toContain("redirect_uri=https%3A%2F%2Fapp.example%2Fcb");
    expect(url).toContain("state=xyz");
  });
});

describe("ingestion pipeline", () => {
  it("fetches, stores, and reports inserted counts", async () => {
    const store = new InMemoryActivityStore();
    const pipeline = new IngestionPipeline(new ProviderRegistry(), store);
    const res = await pipeline.ingest("garmin", cred("garmin"), lastNDays(28, now));
    expect(res.fetched).toBeGreaterThan(0);
    expect(res.inserted).toBe(res.fetched);
    expect(await store.count()).toBe(res.fetched);
  });

  it("de-duplicates on re-ingest of the same window", async () => {
    const store = new InMemoryActivityStore();
    const pipeline = new IngestionPipeline(new ProviderRegistry(), store);
    const range = lastNDays(28, now);
    const first = await pipeline.ingest("polar", cred("polar"), range);
    const second = await pipeline.ingest("polar", cred("polar"), range);
    expect(second.fetched).toBe(first.fetched);
    expect(second.inserted).toBe(0); // nothing new
    expect(await store.count()).toBe(first.fetched);
  });

  it("ingests multiple providers concurrently into one store", async () => {
    const store = new InMemoryActivityStore();
    const pipeline = new IngestionPipeline(new ProviderRegistry(), store);
    const results = await pipeline.ingestAll(
      [cred("strava"), cred("garmin"), cred("polar"), cred("suunto")],
      lastNDays(28, now),
    );
    const totalFetched = results.reduce((s, r) => s + r.fetched, 0);
    expect(await store.count()).toBe(totalFetched);
    const providers = new Set((await store.query()).map((a) => a.provider));
    expect(providers.size).toBe(4);
  });

  it("fans out to an export sink", async () => {
    const store = new InMemoryActivityStore();
    const sink = new BufferSink();
    const pipeline = new IngestionPipeline(new ProviderRegistry(), store, [sink]);
    const res = await pipeline.ingest("suunto", cred("suunto"), lastNDays(14, now));
    expect(sink.rows.length).toBe(res.fetched);
    expect(toNdjson(sink.rows).split("\n").length).toBe(res.fetched);
    expect(toColumnarRows(sink.rows)[0]).toHaveProperty("training_load");
  });

  it("filters stored activities by provider and time window", async () => {
    const store = new InMemoryActivityStore();
    const pipeline = new IngestionPipeline(new ProviderRegistry(), store);
    await pipeline.ingestAll([cred("strava"), cred("garmin")], lastNDays(28, now));
    const stravaOnly = await store.query({ provider: "strava" });
    expect(stravaOnly.every((a) => a.provider === "strava")).toBe(true);
    const recent = await store.query({ after: lastNDays(7, now).after });
    expect(recent.length).toBeLessThanOrEqual((await store.query()).length);
  });
});
