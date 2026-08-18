import type { Request, Response, NextFunction } from "express";
import { listAuditLogs } from "./audit.service.js";

export async function getAuditLogsAdmin(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { search, adminEmail, module: mod, page, limit } = req.query;
    const result = await listAuditLogs({
      search: typeof search === "string" ? search : undefined,
      adminEmail: typeof adminEmail === "string" ? adminEmail : undefined,
      module: typeof mod === "string" ? mod : undefined,
      page: page ? Number(page) : 1,
      limit: limit ? Number(limit) : 20,
    });
    res.json(result);
  } catch (e) {
    next(e);
  }
}
