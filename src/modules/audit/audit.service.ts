import type { Request } from "express";
import { AuditLog } from "./audit.model.js";

export type LogAdminActionOptions = {
  action: string;
  module: string;
  description: string;
  targetId?: string;
  details?: Record<string, unknown>;
};

export async function logAdminAction(req: Request, options: LogAdminActionOptions): Promise<void> {
  try {
    const adminId = (req as Request & { adminId?: string }).adminId || "system";
    const adminEmail =
      (req as Request & { adminEmail?: string }).adminEmail || "admin@system.local";
    const ip =
      (req.headers["x-forwarded-for"] as string) || req.ip || req.socket.remoteAddress || "";
    const userAgent = req.headers["user-agent"] || "";

    await AuditLog.create({
      adminId,
      adminEmail,
      action: options.action,
      module: options.module,
      description: options.description,
      targetId: options.targetId,
      details: options.details,
      ip,
      userAgent,
    });
  } catch (err) {
    console.error("Failed to write audit log:", err);
  }
}

export async function listAuditLogs(query: {
  search?: string;
  adminEmail?: string;
  module?: string;
  page?: number;
  limit?: number;
}) {
  const page = Math.max(1, Number(query.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(query.limit) || 20));
  const skip = (page - 1) * limit;

  const filter: Record<string, unknown> = {};

  if (query.adminEmail?.trim()) {
    filter.adminEmail = new RegExp(query.adminEmail.trim(), "i");
  }

  if (query.module?.trim()) {
    filter.module = query.module.trim();
  }

  if (query.search?.trim()) {
    const s = query.search.trim();
    filter.$or = [
      { description: new RegExp(s, "i") },
      { action: new RegExp(s, "i") },
      { adminEmail: new RegExp(s, "i") },
      { targetId: new RegExp(s, "i") },
    ];
  }

  const [items, total] = await Promise.all([
    AuditLog.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
    AuditLog.countDocuments(filter),
  ]);

  return {
    items,
    total,
    page,
    limit,
    pages: Math.ceil(total / limit) || 1,
  };
}
