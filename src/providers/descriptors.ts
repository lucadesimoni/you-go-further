import type { ProviderId } from "../model";
import type { ProviderDescriptor } from "./types";

/**
 * Static metadata for each supported provider. OAuth endpoints and scopes are
 * the real published values; client id/secret are read from env at runtime and
 * are never stored here.
 */
export const DESCRIPTORS: Record<ProviderId, ProviderDescriptor> = {
  strava: {
    id: "strava",
    displayName: "Strava",
    oauth: {
      authUrl: "https://www.strava.com/oauth/authorize",
      tokenUrl: "https://www.strava.com/oauth/token",
      scopes: ["read", "activity:read_all"],
      clientIdEnv: "STRAVA_CLIENT_ID",
      clientSecretEnv: "STRAVA_CLIENT_SECRET",
    },
    capabilities: { activities: true, heartRate: true, power: true, trainingLoad: false, sleep: false },
    syncNote: "Webhook + polling; ~600 reqs/15 min app-wide rate limit.",
  },
  garmin: {
    id: "garmin",
    displayName: "Garmin Connect",
    oauth: {
      authUrl: "https://connect.garmin.com/oauthConfirm",
      tokenUrl: "https://connectapi.garmin.com/oauth-service/oauth/token",
      scopes: ["activities", "wellness"],
      clientIdEnv: "GARMIN_CONSUMER_KEY",
      clientSecretEnv: "GARMIN_CONSUMER_SECRET",
    },
    capabilities: { activities: true, heartRate: true, power: true, trainingLoad: true, sleep: true },
    syncNote: "Health API push notifications; backfill on connect.",
  },
  polar: {
    id: "polar",
    displayName: "Polar Flow",
    oauth: {
      authUrl: "https://flow.polar.com/oauth2/authorization",
      tokenUrl: "https://polarremote.com/v2/oauth2/token",
      scopes: ["accesslink.read_all"],
      clientIdEnv: "POLAR_CLIENT_ID",
      clientSecretEnv: "POLAR_CLIENT_SECRET",
    },
    capabilities: { activities: true, heartRate: true, power: true, trainingLoad: true, sleep: true },
    syncNote: "AccessLink transactional pull; new sessions via webhook.",
  },
  suunto: {
    id: "suunto",
    displayName: "Suunto App",
    oauth: {
      authUrl: "https://cloudapi-oauth.suunto.com/oauth/authorize",
      tokenUrl: "https://cloudapi-oauth.suunto.com/oauth/token",
      scopes: ["workout"],
      clientIdEnv: "SUUNTO_CLIENT_ID",
      clientSecretEnv: "SUUNTO_CLIENT_SECRET",
    },
    capabilities: { activities: true, heartRate: true, power: false, trainingLoad: true, sleep: true },
    syncNote: "Workout webhook + FIT download.",
  },
};

export const ALL_PROVIDER_IDS: ProviderId[] = ["strava", "garmin", "polar", "suunto"];
