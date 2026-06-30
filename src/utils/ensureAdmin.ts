import bcrypt from "bcryptjs";
import { Admin } from "../models/Admin.js";

/** Create or update the bootstrap admin from ADMIN_EMAIL / ADMIN_PASSWORD. */
export async function ensureAdminFromEnv(): Promise<void> {
  const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD;
  if (!email || password === undefined || password === "") return;

  const existing = await Admin.findOne({ email });
  if (existing) {
    const matches = await bcrypt.compare(password, existing.passwordHash);
    if (!matches) {
      existing.passwordHash = await bcrypt.hash(password, 10);
      await existing.save();
    }
    return;
  }

  await Admin.create({
    email,
    passwordHash: await bcrypt.hash(password, 10),
    role: "admin",
  });
}
