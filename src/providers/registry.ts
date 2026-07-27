import type { Activity, ProviderId } from "../model";
import { ALL_PROVIDER_IDS, DESCRIPTORS } from "./descriptors";
import { generateSampleActivities } from "./sampleData";
import type { ActivityProvider, FetchRange, OAuthConfig, ProviderCredential, ProviderDescriptor } from "./types";

/**
 * Base connector. Builds the real OAuth consent URL from the descriptor. The
 * default {@link fetchActivities} returns deterministic sample data so the whole
 * stack runs without credentials; a real adapter overrides it to call the
 * provider API and normalize the response into {@link Activity} objects.
 */
/**
 * The OAuth block of a descriptor, or a clear failure. Device platforms (Apple
 * Health, Health Connect) have no server-side OAuth at all — asking for it is a
 * programming error, not a runtime condition to paper over.
 */
export function oauthConfig(descriptor: ProviderDescriptor): OAuthConfig {
  if (!descriptor.oauth) {
    throw new Error(`${descriptor.displayName} is an on-device platform — it has no OAuth flow.`);
  }
  return descriptor.oauth;
}

export class BaseActivityProvider implements ActivityProvider {
  constructor(public readonly descriptor: ProviderDescriptor) {}

  authorizeUrl(redirectUri: string, state: string): string {
    const oauth = oauthConfig(this.descriptor);
    const { authUrl, scopes } = oauth;
    const env = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env;
    const clientId = env?.[oauth.clientIdEnv] ?? `\${${oauth.clientIdEnv}}`;
    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: "code",
      scope: scopes.join(" "),
      state,
    });
    return `${authUrl}?${params.toString()}`;
  }

  async fetchActivities(_credential: ProviderCredential, range: FetchRange): Promise<Activity[]> {
    return generateSampleActivities(this.descriptor.id, range.after, range.before);
  }
}

/** Registry of all connectors, keyed by provider id. */
export class ProviderRegistry {
  private readonly providers = new Map<ProviderId, ActivityProvider>();

  constructor(providers?: ActivityProvider[]) {
    const list = providers ?? ALL_PROVIDER_IDS.map((id) => new BaseActivityProvider(DESCRIPTORS[id]));
    for (const p of list) this.providers.set(p.descriptor.id, p);
  }

  get(id: ProviderId): ActivityProvider {
    const p = this.providers.get(id);
    if (!p) throw new Error(`No provider registered for "${id}"`);
    return p;
  }

  list(): ActivityProvider[] {
    return [...this.providers.values()];
  }
}
