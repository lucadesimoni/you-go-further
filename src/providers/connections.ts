import type { ProviderId } from "../model";
import type { ProviderCredential } from "./types";

/** Public view of a connection — never exposes tokens. */
export interface ProviderConnection {
  provider: ProviderId;
  athleteId?: string;
  connectedAt: string;
}

/**
 * Per-user store of provider OAuth credentials. In-memory reference here;
 * production swaps a DB (encrypt tokens at rest, handle refresh).
 */
export interface ConnectionStore {
  save(userId: string, credential: ProviderCredential): Promise<void>;
  get(userId: string, provider: ProviderId): Promise<ProviderCredential | undefined>;
  list(userId: string): Promise<ProviderConnection[]>;
  remove(userId: string, provider: ProviderId): Promise<void>;
}

export class InMemoryConnectionStore implements ConnectionStore {
  private readonly byUser = new Map<string, Map<ProviderId, { cred: ProviderCredential; at: string }>>();

  async save(userId: string, credential: ProviderCredential): Promise<void> {
    const map = this.byUser.get(userId) ?? new Map();
    map.set(credential.provider, { cred: credential, at: new Date().toISOString() });
    this.byUser.set(userId, map);
  }

  async get(userId: string, provider: ProviderId): Promise<ProviderCredential | undefined> {
    return this.byUser.get(userId)?.get(provider)?.cred;
  }

  async list(userId: string): Promise<ProviderConnection[]> {
    const map = this.byUser.get(userId);
    if (!map) return [];
    return [...map.entries()].map(([provider, v]) => ({
      provider,
      athleteId: v.cred.athleteId,
      connectedAt: v.at,
    }));
  }

  async remove(userId: string, provider: ProviderId): Promise<void> {
    this.byUser.get(userId)?.delete(provider);
  }
}
