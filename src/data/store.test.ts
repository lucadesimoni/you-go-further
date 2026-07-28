import { describe, it, expect } from "vitest";
import { InMemoryActivityStore } from "./store";
import type { Activity } from "../model";

const activity = (id: string, over: Partial<Activity> = {}): Activity => ({
  id: `strava:${id}`,
  provider: "strava",
  externalId: id,
  sport: "run",
  startTime: "2026-07-10T06:00:00Z",
  durationSec: 3600,
  ...over,
});

describe("InMemoryActivityStore ownership", () => {
  it("scopes a query to one athlete", async () => {
    const s = new InMemoryActivityStore();
    await s.upsert([activity("1"), activity("2")], "a");
    await s.upsert([activity("3")], "b");
    expect((await s.query({ userId: "a" })).map((x) => x.id)).toEqual(["strava:1", "strava:2"]);
    expect((await s.query({ userId: "b" })).map((x) => x.id)).toEqual(["strava:3"]);
  });

  it("treats the same provider id as different sessions for different athletes", async () => {
    const s = new InMemoryActivityStore();
    await s.upsert([activity("1", { durationSec: 60 })], "a");
    await s.upsert([activity("1", { durationSec: 120 })], "b");
    expect(await s.count()).toBe(2);
    expect((await s.query({ userId: "b" }))[0].durationSec).toBe(120);
  });

  it("still de-duplicates repeated syncs for the same athlete", async () => {
    const s = new InMemoryActivityStore();
    expect(await s.upsert([activity("1")], "a")).toBe(1);
    expect(await s.upsert([activity("1")], "a")).toBe(0);
    expect(await s.count("a")).toBe(1);
  });

  it("keeps working for the client-side store, which has no user", async () => {
    const s = new InMemoryActivityStore();
    await s.upsert([activity("1")]);
    expect((await s.query()).map((x) => x.id)).toEqual(["strava:1"]);
  });
});
