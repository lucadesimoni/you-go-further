import type { Principal } from "./roles";

/** How the user signed in to the app itself (distinct from device providers). */
export type AuthProviderId = "google" | "apple" | "email" | "demo";

/**
 * A signed-in user. Extends {@link Principal} (so it carries role/tier/org for
 * RBAC and billing) with identity fields from the login provider.
 */
export interface Account extends Principal {
  email: string;
  authProvider: AuthProviderId;
  createdAt: string;
}

export const AUTH_PROVIDER_LABELS: Record<Exclude<AuthProviderId, "demo">, string> = {
  google: "Google",
  apple: "Apple",
  email: "email",
};
