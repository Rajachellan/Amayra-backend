import type { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { AppError } from "../utils/AppError.js";

export interface AdminJwtPayload {
  sub: string;
  role: "admin";
}

export function authenticateAdmin(
  req: Request,
  _res: Response,
  next: NextFunction
): void {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    next(new AppError(401, "Unauthorized"));
    return;
  }
  const token = header.slice(7);
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    next(new AppError(500, "JWT_SECRET not configured"));
    return;
  }
  try {
    const payload = jwt.verify(token, secret) as AdminJwtPayload;
    (req as Request & { adminId?: string }).adminId = payload.sub;
    next();
  } catch {
    next(new AppError(401, "Invalid token"));
  }
}
