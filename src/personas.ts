import type { Principal } from "./auth";

/**
 * Demo principals for the in-app role switcher. In production these come from
 * the identity provider (SSO/OIDC); here they let you walk every user flow.
 */
export const PERSONAS: Principal[] = [
  { id: "solo-1", name: "Solo athlete", role: "athlete", tier: "free" },
  { id: "club-athlete-1", name: "Club athlete", role: "athlete", orgId: "swiss-tri-club", tier: "pro" },
  { id: "coach-1", name: "Team coach", role: "coach", orgId: "swiss-tri-club", tier: "pro" },
  { id: "nutri-1", name: "Sports nutritionist", role: "nutritionist", orgId: "swiss-tri-club", tier: "elite" },
  { id: "admin-1", name: "Org admin", role: "admin", orgId: "swiss-tri-club", tier: "elite" },
];

/** A solo athlete owns their own account, so they manage their own billing. */
export const isSolo = (p: Principal): boolean => !p.orgId;
