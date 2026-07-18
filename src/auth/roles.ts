/**
 * Role-based access control (RBAC).
 *
 * Roles map to a fixed set of permissions. Access checks go through
 * {@link hasPermission} / {@link authorize}, so the UI, the API layer, and the
 * data pipeline all enforce the same policy. This is orthogonal to the
 * subscription tier (`src/subscription`): a tier decides *what the account has
 * paid for*, a role decides *what this user may do* within the account.
 */

import type { Tier } from "../subscription";

export type Role = "athlete" | "coach" | "nutritionist" | "admin" | "owner";

export type Permission =
  | "plan:use"
  | "connections:manage"
  | "analysis:view_own"
  | "analysis:view_team"
  | "catalog:read"
  | "catalog:edit"
  | "team:manage"
  | "billing:manage"
  | "org:configure"
  | "data:export";

const ATHLETE: Permission[] = ["plan:use", "connections:manage", "analysis:view_own", "catalog:read"];
const COACH: Permission[] = [...ATHLETE, "analysis:view_team", "team:manage"];
const NUTRITIONIST: Permission[] = ["plan:use", "analysis:view_team", "catalog:read", "catalog:edit"];
const ADMIN: Permission[] = [...COACH, "catalog:edit", "billing:manage", "org:configure", "data:export"];
const OWNER: Permission[] = [...ADMIN]; // owner == admin + non-revocable, enforced elsewhere

export const ROLE_PERMISSIONS: Record<Role, Permission[]> = {
  athlete: ATHLETE,
  coach: COACH,
  nutritionist: NUTRITIONIST,
  admin: ADMIN,
  owner: OWNER,
};

export const ROLE_LABELS: Record<Role, string> = {
  athlete: "Athlete",
  coach: "Coach",
  nutritionist: "Nutritionist",
  admin: "Org admin",
  owner: "Owner",
};

/** An authenticated actor. `tier` is the effective (usually org) subscription. */
export interface Principal {
  id: string;
  name: string;
  role: Role;
  /** Tenant/organization id. Undefined for a solo athlete. */
  orgId?: string;
  tier: Tier;
}

/** Does this role include the given permission? */
export function roleHas(role: Role, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role].includes(permission);
}

/** Does this principal hold the given permission? */
export function hasPermission(principal: Principal, permission: Permission): boolean {
  return roleHas(principal.role, permission);
}

export class ForbiddenError extends Error {
  constructor(
    public readonly permission: Permission,
    public readonly role: Role,
  ) {
    super(`Role "${role}" is not permitted to "${permission}".`);
    this.name = "ForbiddenError";
  }
}

/** Throw unless the principal holds the permission. */
export function authorize(principal: Principal, permission: Permission): void {
  if (!hasPermission(principal, permission)) throw new ForbiddenError(permission, principal.role);
}

/** All permissions granted to a principal — handy for building a UI once. */
export function permissionsOf(principal: Principal): Set<Permission> {
  return new Set(ROLE_PERMISSIONS[principal.role]);
}
