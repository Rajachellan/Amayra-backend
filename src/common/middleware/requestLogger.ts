import type { NextFunction, Request, Response } from "express";
import { accessLogger } from "../../config/logger.js";

export function requestLoggerMiddleware(req: Request, res: Response, next: NextFunction): void {
  const started = Date.now();
  res.on("finish", () => {
    accessLogger.info(
      {
        method: req.method,
        path: req.originalUrl,
        statusCode: res.statusCode,
        durationMs: Date.now() - started,
        requestId: (req as Request & { requestId?: string }).requestId,
        ip: req.ip,
      },
      "HTTP request"
    );
  });
  next();
}
