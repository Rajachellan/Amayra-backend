import type { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { AppError } from "../utils/AppError.js";

export interface AdminJwtPayload {
  sub: string;
  role: "admin";
}

export interface CustomerJwtPayload {
  sub: string;
  role: "customer";
}

type JwtPayload = AdminJwtPayload | CustomerJwtPayload;

function bearerToken(header: string | undefined): string | null {
  if (!header?.startsWith("Bearer ")) return null;
  return header.slice(7);
}

export function authenticateAdmin(
  req: Request,
  _res: Response,
  next: NextFunction
): void {
  const token = bearerToken(req.headers.authorization);
  if (!token) {
    next(new AppError(401, "Unauthorized"));
    return;
  }
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    next(new AppError(500, "JWT_SECRET not configured"));
    return;
  }
  try {
    const payload = jwt.verify(token, secret) as JwtPayload;
    if (!payload?.sub || payload.role !== "admin") {
      next(new AppError(401, "Unauthorized"));
      return;
    }
    (req as Request & { adminId?: string }).adminId = payload.sub;
    next();
  } catch {
    next(new AppError(401, "Invalid token"));
  }
}

export function authenticateCustomer(
  req: Request,
  _res: Response,
  next: NextFunction
): void {
  const token = bearerToken(req.headers.authorization);
  if (!token) {
    next(new AppError(401, "Unauthorized"));
    return;
  }
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    next(new AppError(500, "JWT_SECRET not configured"));
    return;
  }
  try {
    const payload = jwt.verify(token, secret) as JwtPayload;
    if (!payload?.sub || payload.role !== "customer") {
      next(new AppError(401, "Unauthorized"));
      return;
    }
    (req as Request & { customerId?: string }).customerId = payload.sub;
    next();
  } catch {
    next(new AppError(401, "Invalid token"));
  }
}
