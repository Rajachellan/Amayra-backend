import type { Request, Response, NextFunction } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { Admin } from "../models/Admin.js";
import { AppError } from "../utils/AppError.js";

export async function login(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { email, password } = req.body as { email?: string; password?: string };
    if (!email || !password) throw new AppError(400, "email and password required");
    const admin = await Admin.findOne({ email: email.toLowerCase() });
    if (!admin) throw new AppError(401, "Invalid credentials");
    const ok = await bcrypt.compare(password, admin.passwordHash);
    if (!ok) throw new AppError(401, "Invalid credentials");
    const secret = process.env.JWT_SECRET;
    if (!secret) throw new AppError(500, "JWT_SECRET not configured");
    const token = jwt.sign(
      { sub: admin._id.toString(), role: "admin" },
      secret,
      { expiresIn: "7d" }
    );
    const adminPayload = {
      id: admin._id.toString(),
      email: admin.email,
      role: admin.role,
    };
    res.json({
      token,
      admin: adminPayload,
      user: adminPayload,
      success: true,
      message: "Login successful",
    });
  } catch (e) {
    next(e);
  }
}
