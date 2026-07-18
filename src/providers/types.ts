import type { Activity, ProviderId } from "../model";

/** OAuth2 wiring for a provider. Values come from the provider's dev portal. */
export interface OAuthConfig {
  authUrl: string;
  tokenUrl: string;
  scopes: string[];
  /** Env var name that holds the client id (never hard-code secrets). */
  clientIdEnv: string;
  clientSecretEnv: string;
}

/** What kinds of data a provider exposes, so the UI/analysis can adapt. */
export interface ProviderCapabilities {
  activities: boolean;
  heartRate: boolean;
  power: boolean;
  trainingLoad: boolean;
  sleep: boolean;
}

export interface ProviderDescriptor {
  id: ProviderId;
  displayName: string;
  oauth: OAuthConfig;
  capabilities: ProviderCapabilities;
  /** Human note on data freshness / rate limits. */
  syncNote: string;
}

/** OAuth credential for a connected account. Tokens are opaque to us. */
export interface ProviderCredential {
  provider: ProviderId;
  accessToken: string;
  refreshToken?: string;
  /** Epoch ms when the access token expires. */
  expiresAt?: number;
  athleteId?: string;
}

export interface FetchRange {
  /** ISO-8601 inclusive lower bound. */
  after: string;
  /** ISO-8601 exclusive upper bound. */
  before: string;
}

/**
 * A connector to one training-data provider. Real adapters implement
 * {@link fetchActivities} against the provider's REST API and normalize the
 * response into {@link Activity} objects.
 */
export interface ActivityProvider {
  readonly descriptor: ProviderDescriptor;
  /** Build the consent URL the user is redirected to. */
  authorizeUrl(redirectUri: string, state: string): string;
  /** Pull and normalize activities in the given window. */
  fetchActivities(credential: ProviderCredential, range: FetchRange): Promise<Activity[]>;
}
