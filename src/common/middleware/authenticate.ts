import type { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { jwtConfig } from "../../config/jwt.js";
import { logSecurityEvent } from "../../config/logger.js";
import { AppError } from "../errors/AppError.js";
import { isTokenBlacklisted } from "../security/tokenBlacklist.js";
import type { Role } from "../security/rbac.js";

export interface AdminJwtPayload {
  sub: string;
  role: "admin" | "super_admin";
  jti?: string;
  typ?: "access" | "refresh";
}

export interface CustomerJwtPayload {
  sub: string;
  role: "customer";
  jti?: string;
  typ?: "access" | "refresh";
}

type JwtPayload = AdminJwtPayload | CustomerJwtPayload;

function bearerToken(header: string | undefined): string | null {
  if (!header?.startsWith("Bearer ")) return null;
  return header.slice(7);
}

function readToken(req: Request): string | null {
  return bearerToken(req.headers.authorization) ?? (req.cookies?.mairii_access_token as string | undefined) ?? null;
}

function verifyRole(req: Request, next: NextFunction, allowed: Role[]): void {
  const token = readToken(req);
  if (!token) {
    next(new AppError(401, "Unauthorized"));
    return;
  }
  try {
    const payload = jwt.verify(token, jwtConfig.secret) as JwtPayload;
    if (!payload?.sub || !allowed.includes(payload.role as Role)) {
      next(new AppError(401, "Unauthorized"));
      return;
    }
    if (payload.typ === "refresh") {
      next(new AppError(401, "Invalid token"));
      return;
    }
    if (isTokenBlacklisted(payload.jti)) {
      logSecurityEvent("token_blacklisted", { jti: payload.jti });
      next(new AppError(401, "Invalid token"));
      return;
    }
    (req as Request & { authRole?: Role }).authRole = payload.role as Role;
    (req as Request & { authPermissions?: string[] }).authPermissions = (payload as any).permissions ?? [];
    if (payload.role === "customer") {
      (req as Request & { customerId?: string }).customerId = payload.sub;
    } else {
      (req as Request & { adminId?: string }).adminId = payload.sub;
    }
    next();
  } catch {
    next(new AppError(401, "Invalid token"));
  }
}

export function authenticateAdmin(req: Request, _res: Response, next: NextFunction): void {
  verifyRole(req, next, ["admin", "super_admin"]);
}

export function authenticateCustomer(req: Request, _res: Response, next: NextFunction): void {
  verifyRole(req, next, ["customer"]);
}

export function authenticateSuperAdmin(req: Request, _res: Response, next: NextFunction): void {
  verifyRole(req, next, ["super_admin"]);
}
