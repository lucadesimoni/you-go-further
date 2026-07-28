import { afterAll, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { FileActivityStore, FileConnectionStore, FileFeedbackStore } from "./fileStores";
import type { Activity } from "../model";
import type { SessionFeedback } from "../feedback";

const dir = mkdtempSync(join(tmpdir(), "ygf-persist-"));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

const activity = (id: string): Activity => ({
  id: `strava:${id}`,
  provider: "strava",
  externalId: id,
  sport: "ride",
  startTime: "2026-07-10T06:00:00Z",
  durationSec: 3600,
});

const feedback: SessionFeedback = {
  id: "f1",
  date: "2026-07-10T08:00:00Z",
  durationMin: 120,
  plannedCarbPerHourG: 90,
  gi: "severe",
  energy: "steady",
};

describe("file-backed stores persist across restarts", () => {
  it("activities survive a new store instance from the same dir", async () => {
    const s1 = new FileActivityStore(dir);
    await s1.upsert([activity("1"), activity("2")]);
    expect(await s1.count()).toBe(2);

    // Simulate a process restart: brand-new instance, same directory.
    const s2 = new FileActivityStore(dir);
    expect(await s2.count()).toBe(2);
    const q = await s2.query({ provider: "strava" });
    expect(q).toHaveLength(2);
  });

  it("feedback survives a restart, keyed by user", async () => {
    await new FileFeedbackStore(dir).add("user-a", feedback);
    const reopened = new FileFeedbackStore(dir);
    expect(await reopened.list("user-a")).toHaveLength(1);
    expect(await reopened.list("user-b")).toHaveLength(0);
  });

  it("provider connections survive a restart", async () => {
    await new FileConnectionStore(dir).save("user-a", {
      provider: "strava",
      accessToken: "tok",
      athleteId: "42",
    });
    const reopened = new FileConnectionStore(dir);
    const list = await reopened.list("user-a");
    expect(list).toHaveLength(1);
    expect(list[0].provider).toBe("strava");
    expect(list[0].athleteId).toBe("42");
    expect(await reopened.get("user-a", "strava")).toBeDefined();
    await reopened.remove("user-a", "strava");
    expect(await new FileConnectionStore(dir).list("user-a")).toHaveLength(0);
  });
});

describe("sessions belong to one athlete", () => {
  const owned = mkdtempSync(join(tmpdir(), "ygf-owned-"));
  afterAll(() => rmSync(owned, { recursive: true, force: true }));

  it("never returns another athlete's sessions", async () => {
    const s = new FileActivityStore(owned);
    await s.upsert([activity("1"), activity("2")], "user-a");
    await s.upsert([activity("9")], "user-b");

    expect((await s.query({ userId: "user-a" })).map((a) => a.id)).toEqual(["strava:1", "strava:2"]);
    expect((await s.query({ userId: "user-b" })).map((a) => a.id)).toEqual(["strava:9"]);
    expect(await s.count("user-a")).toBe(2);
  });

  it("keeps two athletes' identically-numbered sessions apart", async () => {
    // A provider activity id is unique within an account, not across the
    // platform: "strava:1" can be a different ride for a different athlete.
    const s = new FileActivityStore(mkdtempSync(join(tmpdir(), "ygf-owned2-")));
    await s.upsert([{ ...activity("1"), durationSec: 3600 }], "user-a");
    await s.upsert([{ ...activity("1"), durationSec: 7200 }], "user-b");

    expect(await s.count()).toBe(2);
    expect((await s.query({ userId: "user-a" }))[0].durationSec).toBe(3600);
    expect((await s.query({ userId: "user-b" }))[0].durationSec).toBe(7200);
  });

  it("does not hand the ownership marker back to callers", async () => {
    const s = new FileActivityStore(mkdtempSync(join(tmpdir(), "ygf-owned3-")));
    await s.upsert([activity("1")], "user-a");
    expect(Object.keys((await s.query({ userId: "user-a" }))[0])).not.toContain("userId");
  });

  it("clears one athlete without touching the other", async () => {
    const s = new FileActivityStore(mkdtempSync(join(tmpdir(), "ygf-owned4-")));
    await s.upsert([activity("1")], "user-a");
    await s.upsert([activity("2")], "user-b");
    await s.clear("user-a");
    expect(await s.count("user-a")).toBe(0);
    expect(await s.count("user-b")).toBe(1);
  });
});
