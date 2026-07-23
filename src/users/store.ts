import type { Role } from "../auth";
import type { Tier } from "../subscription";
import { PERSONAS } from "../personas";

/**
 * A platform user. In production these are provisioned by the identity provider
 * (SSO/OIDC) and enriched here with role, subscription tier and status; the admin
 * area manages that layer. Backend-neutral, same as the other stores.
 */
export interface User {
  id: string;
  name: string;
  email: string;
  role: Role;
  tier: Tier;
  /** Tenant this user belongs to (absent for solo athletes). */
  orgId?: string;
  status: "active" | "suspended";
  /** ISO-8601 creation timestamp. */
  createdAt: string;
}

/** Fields an admin may set when creating / inviting a user. */
export interface NewUser {
  name: string;
  email: string;
  role: Role;
  tier: Tier;
  orgId?: string;
}

/** Fields an admin may change on an existing user. */
export interface UserPatch {
  name?: string;
  role?: Role;
  tier?: Tier;
  status?: User["status"];
}

export interface UserStore {
  /** All users, optionally scoped to one tenant. */
  list(orgId?: string): Promise<User[]>;
  get(id: string): Promise<User | undefined>;
  create(user: User): Promise<User>;
  update(id: string, patch: UserPatch): Promise<User | undefined>;
  remove(id: string): Promise<void>;
}

/** Seed users from the demo personas so a fresh install has a populated org. */
export function seedUsers(): User[] {
  return PERSONAS.map((p, i) => ({
    id: p.id,
    name: p.name,
    email: `${p.name.toLowerCase().replace(/[^a-z0-9]+/g, ".")}@yougofurther.ch`,
    role: p.role,
    tier: p.tier,
    orgId: p.orgId,
    status: "active" as const,
    createdAt: new Date(Date.now() - (PERSONAS.length - i) * 86_400_000).toISOString(),
  }));
}

export class InMemoryUserStore implements UserStore {
  private readonly byId = new Map<string, User>();

  constructor(seed: User[] = seedUsers()) {
    for (const u of seed) this.byId.set(u.id, u);
  }

  async list(orgId?: string): Promise<User[]> {
    const all = [...this.byId.values()].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    return orgId === undefined ? all : all.filter((u) => u.orgId === orgId);
  }

  async get(id: string): Promise<User | undefined> {
    return this.byId.get(id);
  }

  async create(user: User): Promise<User> {
    this.byId.set(user.id, user);
    return user;
  }

  async update(id: string, patch: UserPatch): Promise<User | undefined> {
    const cur = this.byId.get(id);
    if (!cur) return undefined;
    const next: User = {
      ...cur,
      ...(patch.name !== undefined ? { name: patch.name } : {}),
      ...(patch.role !== undefined ? { role: patch.role } : {}),
      ...(patch.tier !== undefined ? { tier: patch.tier } : {}),
      ...(patch.status !== undefined ? { status: patch.status } : {}),
    };
    this.byId.set(id, next);
    return next;
  }

  async remove(id: string): Promise<void> {
    this.byId.delete(id);
  }
}

const ROLES: Role[] = ["athlete", "coach", "nutritionist", "admin", "owner"];
const TIERS: Tier[] = ["free", "pro", "elite"];

/** Validate and normalize an admin-supplied new user. Throws a user-facing message. */
export function normalizeNewUser(input: Partial<NewUser>, orgId?: string): User {
  const name = (input.name ?? "").trim();
  const email = (input.email ?? "").trim().toLowerCase();
  if (!name) throw new Error("Name is required.");
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new Error("A valid email is required.");
  const role = input.role && ROLES.includes(input.role) ? input.role : "athlete";
  const tier = input.tier && TIERS.includes(input.tier) ? input.tier : "free";
  return {
    id: `user:${email}`,
    name,
    email,
    role,
    tier,
    orgId: input.orgId ?? orgId,
    status: "active",
    createdAt: new Date().toISOString(),
  };
}

/** Validate an admin patch, keeping only recognized enum values. */
export function normalizeUserPatch(input: Partial<UserPatch>): UserPatch {
  const patch: UserPatch = {};
  if (typeof input.name === "string" && input.name.trim()) patch.name = input.name.trim();
  if (input.role && ROLES.includes(input.role)) patch.role = input.role;
  if (input.tier && TIERS.includes(input.tier)) patch.tier = input.tier;
  if (input.status === "active" || input.status === "suspended") patch.status = input.status;
  return patch;
}
