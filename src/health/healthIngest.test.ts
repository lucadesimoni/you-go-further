import { describe, it, expect } from "vitest";
import {
  mapHealthSport,
  normalizeHealthSync,
  profileUpdateFromSync,
  readinessFromSignals,
} from "./healthIngest";
import type { Wellness } from "../model";

const NOW = new Date("2026-03-20T10:00:00.000Z");

const workout = (over: Record<string, unknown> = {}) => ({
  externalId: "uuid-1",
  sport: "HKWorkoutActivityTypeRunning",
  startTime: "2026-03-19T06:30:00.000Z",
  durationSec: 3600,
  distanceM: 12000,
  ...over,
});

describe("mapHealthSport", () => {
  it("maps HealthKit and Health Connect names to our sports", () => {
    expect(mapHealthSport("HKWorkoutActivityTypeRunning")).toBe("run");
    expect(mapHealthSport("RUNNING")).toBe("run");
    expect(mapHealthSport("HKWorkoutActivityTypeCycling")).toBe("ride");
    expect(mapHealthSport("BIKING")).toBe("ride");
    expect(mapHealthSport("HKWorkoutActivityTypeSwimming")).toBe("swim");
  });

  it("prefers trail-run over run when the name says trail", () => {
    expect(mapHealthSport("HKWorkoutActivityTypeTrailRunning")).toBe("trail-run");
    expect(mapHealthSport("RUNNING_TREADMILL")).toBe("run");
  });

  it("degrades an unknown sport to other rather than failing", () => {
    expect(mapHealthSport("HKWorkoutActivityTypeCurling")).toBe("other");
    expect(mapHealthSport("")).toBe("other");
  });
});

describe("normalizeHealthSync", () => {
  it("rejects a payload without a known platform", () => {
    expect(normalizeHealthSync({ platform: "strava" }, NOW)).toBeNull();
    expect(normalizeHealthSync({}, NOW)).toBeNull();
    expect(normalizeHealthSync(null, NOW)).toBeNull();
  });

  it("normalizes workouts into activities with a de-duplicating id", () => {
    const r = normalizeHealthSync({ platform: "apple-health", workouts: [workout()] }, NOW)!;
    expect(r.activities).toHaveLength(1);
    const a = r.activities[0];
    expect(a.id).toBe("apple-health:uuid-1");
    expect(a.provider).toBe("apple-health");
    expect(a.sport).toBe("run");
    expect(a.durationSec).toBe(3600);
    expect(a.distanceM).toBe(12000);
  });

  it("drops implausible workouts instead of storing them", () => {
    const r = normalizeHealthSync(
      {
        platform: "apple-health",
        workouts: [
          workout({ externalId: "" }), // no identity
          workout({ externalId: "a", durationSec: 30 }), // too short to be a session
          workout({ externalId: "b", durationSec: 90_000 }), // longer than a day
          workout({ externalId: "c", startTime: "2030-01-01T00:00:00Z" }), // in the future
          workout({ externalId: "d", startTime: "not a date" }),
          workout({ externalId: "keep" }), // the only good one
        ],
      },
      NOW,
    )!;
    expect(r.activities.map((a) => a.externalId)).toEqual(["keep"]);
    expect(r.rejected.workouts).toBe(5);
  });

  it("keeps out-of-range vitals out rather than clamping them into believable lies", () => {
    const r = normalizeHealthSync(
      { platform: "apple-health", workouts: [workout({ avgHr: 900, elevationGainM: -5 })] },
      NOW,
    )!;
    expect(r.activities[0].avgHr).toBeUndefined();
    expect(r.activities[0].elevationGainM).toBeUndefined();
  });

  it("keeps only days that carry at least one real signal", () => {
    const r = normalizeHealthSync(
      {
        platform: "google-health",
        daily: [
          { date: "2026-03-19", hrvMs: 62, restingHr: 48 },
          { date: "2026-03-18" }, // nothing measured
          { date: "19-03-2026", hrvMs: 60 }, // not an ISO date
        ],
      },
      NOW,
    )!;
    expect(r.wellness).toHaveLength(1);
    expect(r.wellness[0]).toMatchObject({ provider: "google-health", date: "2026-03-19", hrvMs: 62 });
    expect(r.rejected.days).toBe(2);
  });

  it("accepts body mass only inside a human range", () => {
    expect(normalizeHealthSync({ platform: "apple-health", bodyMassKg: 71.4 }, NOW)!.bodyMassKg).toBe(71);
    expect(normalizeHealthSync({ platform: "apple-health", bodyMassKg: 3 }, NOW)!.bodyMassKg).toBeUndefined();
    expect(normalizeHealthSync({ platform: "apple-health", bodyMassKg: 900 }, NOW)!.bodyMassKg).toBeUndefined();
  });
});

const days = (n: number, f: (i: number) => Partial<Wellness>): Wellness[] =>
  Array.from({ length: n }, (_, i) => ({
    provider: "apple-health" as const,
    date: new Date(NOW.getTime() - i * 86_400_000).toISOString().slice(0, 10),
    ...f(i),
  }));

describe("readinessFromSignals", () => {
  it("returns undefined with nothing to go on — it never invents a number", () => {
    expect(readinessFromSignals([], NOW)).toBeUndefined();
    // One day is not a baseline.
    expect(readinessFromSignals(days(1, () => ({ hrvMs: 60 })), NOW)).toBeUndefined();
  });

  it("uses the platform's own readiness when it reports one", () => {
    const w = days(5, (i) => ({ hrvMs: 60, readiness: i === 0 ? 82 : 50 }));
    expect(readinessFromSignals(w, NOW)).toBe(82);
  });

  it("scores a steady athlete around neutral", () => {
    const r = readinessFromSignals(days(10, () => ({ hrvMs: 60, restingHr: 48 })), NOW)!;
    expect(r).toBeGreaterThanOrEqual(60);
    expect(r).toBeLessThanOrEqual(70);
  });

  it("drops readiness when HRV falls below the athlete's own baseline", () => {
    const suppressed = days(10, (i) => ({ hrvMs: i === 0 ? 42 : 62, restingHr: i === 0 ? 55 : 48 }));
    const steady = days(10, () => ({ hrvMs: 62, restingHr: 48 }));
    expect(readinessFromSignals(suppressed, NOW)!).toBeLessThan(readinessFromSignals(steady, NOW)!);
  });

  it("raises readiness when HRV is above baseline", () => {
    const fresh = days(10, (i) => ({ hrvMs: i === 0 ? 78 : 60, restingHr: 46 }));
    expect(readinessFromSignals(fresh, NOW)!).toBeGreaterThan(70);
  });

  it("stays inside 0–100 even for extreme readings", () => {
    const wild = days(10, (i) => ({ hrvMs: i === 0 ? 5 : 200, restingHr: i === 0 ? 120 : 30, sleepScore: 0 }));
    const r = readinessFromSignals(wild, NOW)!;
    expect(r).toBeGreaterThanOrEqual(0);
    expect(r).toBeLessThanOrEqual(100);
  });
});

describe("profileUpdateFromSync", () => {
  it("updates weight and readiness, and records where it came from", () => {
    const sync = normalizeHealthSync(
      {
        platform: "apple-health",
        bodyMassKg: 68,
        daily: days(10, () => ({ hrvMs: 60, restingHr: 48 })).map(({ date, hrvMs, restingHr }) => ({
          date,
          hrvMs,
          restingHr,
        })),
      },
      NOW,
    )!;
    const update = profileUpdateFromSync(sync, "Apple Health", NOW);
    expect(update.bodyWeightKg).toBe(68);
    expect(update.readiness).toBeGreaterThan(0);
    expect(update.syncedFrom).toBe("Apple Health");
  });

  it("never touches sweat sodium — a phone cannot measure it", () => {
    const sync = normalizeHealthSync({ platform: "apple-health", bodyMassKg: 68 }, NOW)!;
    const update = profileUpdateFromSync(sync, "Apple Health", NOW) as Record<string, unknown>;
    expect(update.sweatSodiumMgPerL).toBeUndefined();
    expect(update.sweatRateMlPerH).toBeUndefined();
  });

  it("leaves weight alone when the platform has no body mass", () => {
    const sync = normalizeHealthSync({ platform: "google-health" }, NOW)!;
    expect(profileUpdateFromSync(sync, "Health Connect", NOW).bodyWeightKg).toBeUndefined();
  });
});
