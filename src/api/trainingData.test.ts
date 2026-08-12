import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { __setConfigForTests } from "../config";
import {
  loadConnections,
  connectProvider,
  disconnectProvider,
  loadActivities,
  trainingDataMode,
  __resetTrainingDataCache,
} from "./trainingData";

/**
 * The client-side demo, which is the build most people meet first.
 *
 * Every assertion here is something that was broken before this module existed:
 * a connection that vanished when you left the screen, a Home with no sessions,
 * and two screens generating different sessions for the same athlete so a
 * "review this run" handoff landed on the wrong one.
 */

/** A minimal sessionStorage, since the unit suite runs in Node. */
class MemoryStorage implements Storage {
  private data = new Map<string, string>();
  get length() {
    return this.data.size;
  }
  clear() {
    this.data.clear();
  }
  getItem(k: string) {
    return this.data.get(k) ?? null;
  }
  key(i: number) {
    return [...this.data.keys()][i] ?? null;
  }
  removeItem(k: string) {
    this.data.delete(k);
  }
  setItem(k: string, v: string) {
    this.data.set(k, v);
  }
}

beforeEach(() => {
  (globalThis as { sessionStorage?: Storage }).sessionStorage = new MemoryStorage();
  __setConfigForTests({ apiBaseUrl: "" }); // the client-side build
  __resetTrainingDataCache();
});

afterEach(() => {
  delete (globalThis as { sessionStorage?: Storage }).sessionStorage;
  __setConfigForTests(null);
});

describe("training data, client-side", () => {
  it("reports where it is storing things", () => {
    expect(trainingDataMode()).toBe("local");
    __setConfigForTests({ apiBaseUrl: "https://api.example" });
    expect(trainingDataMode()).toBe("server");
  });

  it("remembers a connection across screens and reloads", async () => {
    expect(await loadConnections()).toEqual([]);
    await connectProvider("strava");
    // A second, independent read — this is the "leave Connect and come back"
    // that used to lose the connection, because it lived in React state.
    expect(await loadConnections()).toEqual(["strava"]);
    // And the "reload": the same storage, read from scratch.
    __resetTrainingDataCache();
    expect(await loadConnections()).toEqual(["strava"]);
  });

  it("connects idempotently and disconnects", async () => {
    await connectProvider("strava");
    await connectProvider("strava");
    expect(await loadConnections()).toEqual(["strava"]);
    await connectProvider("garmin");
    expect((await loadConnections()).sort()).toEqual(["garmin", "strava"]);
    await disconnectProvider("strava");
    expect(await loadConnections()).toEqual(["garmin"]);
  });

  it("gives a connected athlete real sessions, and an unconnected one none", async () => {
    expect(await loadActivities()).toEqual([]);
    await connectProvider("strava");
    const activities = await loadActivities();
    expect(activities.length).toBeGreaterThan(10);
    // Through the real pipeline: normalised, owned, newest first.
    for (const a of activities) {
      expect(a.id).toBeTruthy();
      expect(Number.isFinite(a.durationSec)).toBe(true);
    }
    const times = activities.map((a) => Date.parse(a.startTime));
    expect([...times].sort((x, y) => y - x)).toEqual(times);
  });

  it("returns the same sessions on a second load, so a handoff cannot miss", async () => {
    // The generator is seeded on the calendar day. If it were seeded on "now",
    // Home and the route screen would hold different sessions with different
    // ids for the same athlete — which is exactly how "review this run" opens
    // the wrong run.
    await connectProvider("strava");
    const first = (await loadActivities()).map((a) => a.id);
    __resetTrainingDataCache();
    const second = (await loadActivities()).map((a) => a.id);
    expect(second).toEqual(first);
  });

  it("changes the sessions when the connections change", async () => {
    await connectProvider("strava");
    const stravaOnly = await loadActivities();
    await connectProvider("garmin");
    const both = await loadActivities();
    expect(both.length).toBeGreaterThan(stravaOnly.length);
  });

  it("ignores a provider id left over from an older build", async () => {
    sessionStorage.setItem("ygf.demo.connections.v1", JSON.stringify(["strava", "fitbit-that-never-existed"]));
    expect(await loadConnections()).toEqual(["strava"]);
  });

  it("survives storage being unavailable rather than taking the app down", async () => {
    delete (globalThis as { sessionStorage?: Storage }).sessionStorage;
    expect(await loadConnections()).toEqual([]);
    await expect(connectProvider("strava")).resolves.toEqual(["strava"]);
    expect(await loadActivities()).toEqual([]);
  });
});
