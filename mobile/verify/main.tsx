import { createRoot } from "react-dom/client";
import { createElement } from "react";
import App from "../App";
import { setApiBase } from "../src/api";
import { setHealthSource } from "../src/health";

const params = new URLSearchParams(location.search);

const base = params.get("api");
if (base) setApiBase(base);

/**
 * `?health=apple-health` stands in for HealthKit / Health Connect, which cannot
 * run in a browser. Only the *reading* step is faked — permission, payload
 * shape, the POST to /api/health/sync, validation, readiness and the profile
 * update are all the real code paths.
 */
const fakePlatform = params.get("health");
if (fakePlatform === "apple-health" || fakePlatform === "google-health") {
  const day = (i: number) => new Date(Date.now() - i * 86_400_000).toISOString().slice(0, 10);
  setHealthSource({
    platform: fakePlatform,
    displayName: fakePlatform === "apple-health" ? "Apple Health" : "Health Connect",
    async requestPermission() {
      return true;
    },
    async read(days) {
      return {
        bodyMassKg: 66,
        daily: Array.from({ length: Math.min(days, 10) }, (_, i) => ({
          date: day(i),
          // A dip on the most recent day, so readiness is visibly derived rather
          // than a constant.
          hrvMs: i === 0 ? 44 : 62,
          restingHr: i === 0 ? 53 : 47,
        })),
        workouts: [
          {
            externalId: "verify-hk-1",
            sport: "HKWorkoutActivityTypeTrailRunning",
            startTime: new Date(Date.now() - 86_400_000).toISOString(),
            durationSec: 7200,
            distanceM: 18000,
          },
          {
            externalId: "verify-hk-2",
            sport: "HKWorkoutActivityTypeCycling",
            startTime: new Date(Date.now() - 3 * 86_400_000).toISOString(),
            durationSec: 5400,
            distanceM: 45000,
          },
          // Deliberately unusable — proves the server drops it and says so.
          { externalId: "verify-bad", sport: "RUNNING", startTime: "not-a-date", durationSec: 3600 },
        ],
      };
    },
  });
}

createRoot(document.getElementById("root")!).render(createElement(App));
