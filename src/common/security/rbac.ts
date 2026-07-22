import type { NextFunction, Request, Response } from "express";
import { AppError } from "../errors/AppError.js";

export type Role = "customer" | "admin" | "super_admin";

export type Permission =
  | "catalog:read"
  | "catalog:write"
  | "orders:read"
  | "orders:write"
  | "payments:read"
  | "shipments:write"
  | "homepage:write"
  | "customers:read"
  | "admin:manage";

const ROLE_PERMISSIONS: Record<Role, readonly Permission[]> = {
  customer: ["catalog:read", "orders:read", "orders:write"],
  admin: [
    "catalog:read",
    "catalog:write",
    "orders:read",
    "orders:write",
    "payments:read",
    "shipments:write",
    "homepage:write",
    "customers:read",
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
    "admin:manage",
  ],
};

export function roleHasPermission(role: Role, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role]?.includes(permission) ?? false;
}

/** Use after authenticateAdmin — maps admin JWT role to permissions. */
export function requirePermission(...permissions: Permission[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const role = ((req as Request & { authRole?: Role }).authRole ?? "admin") as Role;
    const missing = permissions.filter((p) => !roleHasPermission(role, p));
    if (missing.length) {
      next(new AppError(403, "Forbidden"));
      return;
    }
    next();
  };
}
