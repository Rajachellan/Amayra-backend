import type { Request, Response, NextFunction } from "express";
import { signAccessToken, signRefreshToken } from "../../common/auth/tokens.js";
import { verifyPassword } from "../../common/security/password.js";
import { AppError } from "../../utils/AppError.js";
import { logSecurityEvent } from "../../config/logger.js";
import { Admin } from "./model.js";

export async function login(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { email, password } = req.body as { email?: string; password?: string };
    if (!email || !password) throw new AppError(400, "email and password required");
    const admin = await Admin.findOne({ email: email.toLowerCase() });
    if (!admin) {
      logSecurityEvent("admin_login_failed", { email: String(email).toLowerCase(), ip: req.ip });
      throw new AppError(401, "Invalid credentials");
    }
    const ok = await verifyPassword(password, admin.passwordHash);
    if (!ok) {
      logSecurityEvent("admin_login_failed", { email: admin.email, ip: req.ip });
      throw new AppError(401, "Invalid credentials");
    }

    const role = admin.role === "super_admin" ? "super_admin" : (admin.role ?? "admin");
    const permissions = admin.permissions ?? [];
    const { token } = signAccessToken(admin._id.toString(), role as any, permissions);
    const { token: refreshToken } = signRefreshToken(admin._id.toString(), role as any);

    const adminPayload = {
      id: admin._id.toString(),
      email: admin.email,
      role: admin.role,
      permissions,
    };

    logSecurityEvent("admin_login_success", { adminId: adminPayload.id, ip: req.ip });

    // Keep existing response shape for admin panel compatibility.
    // refreshToken is additive and ignored by older clients.
    res.json({
      token,
      refreshToken,
      admin: adminPayload,
      user: adminPayload,
      success: true,
      message: "Login successful",
    });
  } catch (e) {
    next(e);
  }
}
