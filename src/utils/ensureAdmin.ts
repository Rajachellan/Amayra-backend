import { env, logger } from "../config/index.js";
import { hashPassword, verifyPassword } from "../common/security/password.js";
import { Admin } from "../models/Admin.js";

/** Create or update the bootstrap admin from ADMIN_EMAIL / ADMIN_PASSWORD. */
export async function ensureAdminFromEnv(): Promise<void> {
  const email = env.ADMIN_EMAIL?.trim().toLowerCase();
  const password = env.ADMIN_PASSWORD;
  if (!email || password === undefined || password === "") return;

  const existing = await Admin.findOne({ email });
  if (existing) {
    let updated = false;
    const forceReset = process.env.ADMIN_PASSWORD_FORCE_RESET === "true";
    if (forceReset && password !== "changeme") {
      const matches = await verifyPassword(password, existing.passwordHash);
      if (!matches) {
        existing.passwordHash = await hashPassword(password);
        updated = true;
        logger.warn("Admin password forcefully updated from ADMIN_PASSWORD environment variable");
      }
    }
    if (existing.role !== "super_admin") {
      existing.role = "super_admin" as any;
      updated = true;
    }
    if (updated) {
      await existing.save();
    }
    return;
  }

  await Admin.create({
    email,
    passwordHash: await hashPassword(password),
    role: "super_admin",
  });
  logger.info("Bootstrap admin ensured from environment");
}
