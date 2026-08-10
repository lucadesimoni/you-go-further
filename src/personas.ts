import type { Principal } from "./auth";
import type { AthleteProfile } from "./users/profileStore";

/**
 * Demo principals for the in-app role switcher. In production these come from
 * the identity provider (SSO/OIDC); here they let you walk every user flow.
 *
 * They are deliberately *people*, not roles. The sign-in screen used to label
 * each chip with `role`, which gave two buttons both reading "Athlete" — the
 * solo athlete and the club athlete are the two most different accounts in the
 * product and they were indistinguishable. A demo persona also carries a body
 * profile, so the plans you see are somebody's rather than the defaults.
 */
export interface Persona extends Principal {
  /** One line on who this is, shown under the chip. */
  blurb: string;
  /** The body profile the demo starts from — a real athlete, not 70 kg average. */
  profile: Partial<AthleteProfile>;
}

export const PERSONAS: Persona[] = [
  {
    id: "solo-1",
    name: "Nina",
    role: "athlete",
    tier: "free",
    blurb: "Solo athlete · trail",
    profile: { bodyWeightKg: 58, maxHrBpm: 194, sweatLevel: "light", caffeineOk: true },
  },
  {
    id: "club-athlete-1",
    name: "Marco",
    role: "athlete",
    orgId: "swiss-tri-club",
    tier: "pro",
    blurb: "Club athlete · triathlon",
    profile: { bodyWeightKg: 74, maxHrBpm: 188, sweatLevel: "heavy", caffeineOk: true },
  },
  {
    id: "coach-1",
    name: "Team coach",
    role: "coach",
    orgId: "swiss-tri-club",
    tier: "pro",
    blurb: "Sees the whole squad",
    profile: { bodyWeightKg: 72, maxHrBpm: 185 },
  },
  {
    id: "nutri-1",
    name: "Sports nutritionist",
    role: "nutritionist",
    orgId: "swiss-tri-club",
    tier: "elite",
    blurb: "Product library & plans",
    profile: { bodyWeightKg: 68, maxHrBpm: 186 },
  },
  {
    id: "admin-1",
    name: "Org admin",
    role: "admin",
    orgId: "swiss-tri-club",
    tier: "elite",
    blurb: "Users, keys, settings",
    profile: { bodyWeightKg: 70, maxHrBpm: 188 },
  },
];

/** A solo athlete owns their own account, so they manage their own billing. */
export const isSolo = (p: Principal): boolean => !p.orgId;
