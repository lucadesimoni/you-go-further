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
