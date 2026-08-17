import type { NextFunction, Request, Response } from "express";
import { AppError } from "../errors/AppError.js";

export type Role = "customer" | "admin" | "editor" | "super_admin";

export type Permission =
  | "catalog:read"
  | "catalog:write"
  | "orders:read"
  | "orders:write"
  | "payments:read"
  | "shipments:write"
  | "homepage:write"
  | "customers:read"
  | "blogs:write"
  | "admin:manage";

const ROLE_PERMISSIONS: Record<Role, readonly Permission[]> = {
  customer: ["catalog:read", "orders:read", "orders:write"],
  editor: ["catalog:read", "blogs:write"],
  admin: [
    "catalog:read",
    "catalog:write",
    "orders:read",
    "orders:write",
    "payments:read",
    "shipments:write",
    "homepage:write",
    "customers:read",
    "blogs:write",
    "admin:manage",
  ],
  super_admin: [
    "catalog:read",
    "catalog:write",
    "orders:read",
    "orders:write",
    "payments:read",
    "shipments:write",
    "homepage:write",
    "customers:read",
    "blogs:write",
    "admin:manage",
  ],
};

export function roleHasPermission(role: Role, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role]?.includes(permission) ?? false;
}

/** Use after authenticateAdmin — maps admin JWT role/permissions to checks. */
export function requirePermission(...permissions: Permission[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const role = ((req as Request & { authRole?: Role }).authRole ?? "admin") as Role;
    if (role === "super_admin" || role === "admin") {
      next();
      return;
    }
    const explicitPerms = (req as Request & { authPermissions?: string[] }).authPermissions;
    const userPermissions =
      explicitPerms && explicitPerms.length > 0
        ? (explicitPerms as Permission[])
        : ((ROLE_PERMISSIONS[role] ?? []) as Permission[]);
    const missing = permissions.filter((p) => !userPermissions.includes(p));
    if (missing.length) {
      next(new AppError(403, "Forbidden"));
      return;
    }
    next();
  };
}
