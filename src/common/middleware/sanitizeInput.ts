import type { NextFunction, Request, Response } from "express";
import { sanitizeRequestPayload } from "../security/sanitize.js";

export function sanitizeInputMiddleware(req: Request, _res: Response, next: NextFunction): void {
  if (req.body && typeof req.body === "object") {
    req.body = sanitizeRequestPayload(req.body);
  }
  if (req.query && typeof req.query === "object") {
    req.query = sanitizeRequestPayload(req.query) as typeof req.query;
  }
  if (req.params && typeof req.params === "object") {
    req.params = sanitizeRequestPayload(req.params) as typeof req.params;
  }
  next();
}
