import { describe, expect, it } from "vitest";
import {
  authorize,
  ForbiddenError,
  hasPermission,
  permissionsOf,
  roleHas,
  ROLE_PERMISSIONS,
  type Principal,
} from "./roles";

const principal = (over: Partial<Principal> = {}): Principal => ({
  id: "u1",
  name: "Test",
  role: "athlete",
  tier: "free",
  ...over,
});

describe("RBAC roles", () => {
  it("gives an athlete their own data but not the team's", () => {
    const p = principal({ role: "athlete" });
    expect(hasPermission(p, "analysis:view_own")).toBe(true);
    expect(hasPermission(p, "plan:use")).toBe(true);
    expect(hasPermission(p, "analysis:view_team")).toBe(false);
    expect(hasPermission(p, "billing:manage")).toBe(false);
  });

  it("lets a coach see the team and manage members but not billing", () => {
    const p = principal({ role: "coach" });
    expect(hasPermission(p, "analysis:view_team")).toBe(true);
    expect(hasPermission(p, "team:manage")).toBe(true);
    expect(hasPermission(p, "billing:manage")).toBe(false);
  });

  it("lets a nutritionist edit the catalog but not connect devices", () => {
    const p = principal({ role: "nutritionist" });
    expect(hasPermission(p, "catalog:edit")).toBe(true);
    expect(hasPermission(p, "connections:manage")).toBe(false);
  });

  it("grants admin/owner the full surface", () => {
    for (const role of ["admin", "owner"] as const) {
      const p = principal({ role });
      expect(hasPermission(p, "billing:manage")).toBe(true);
      expect(hasPermission(p, "org:configure")).toBe(true);
      expect(hasPermission(p, "data:export")).toBe(true);
      expect(hasPermission(p, "team:manage")).toBe(true);
    }
  });

  it("authorize throws ForbiddenError when the role lacks the permission", () => {
    expect(() => authorize(principal({ role: "athlete" }), "billing:manage")).toThrowError(ForbiddenError);
    expect(() => authorize(principal({ role: "owner" }), "billing:manage")).not.toThrow();
  });

  it("roleHas and permissionsOf agree with the permission map", () => {
    for (const role of Object.keys(ROLE_PERMISSIONS) as (keyof typeof ROLE_PERMISSIONS)[]) {
      const perms = permissionsOf(principal({ role }));
      for (const perm of ROLE_PERMISSIONS[role]) {
        expect(roleHas(role, perm)).toBe(true);
        expect(perms.has(perm)).toBe(true);
      }
    }
  });
});
