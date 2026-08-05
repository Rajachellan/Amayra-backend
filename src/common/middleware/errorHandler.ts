import type { NextFunction, Request, Response } from "express";
import mongoose from "mongoose";
import multer from "multer";
import { ZodError } from "zod";
import { isProduction } from "../../config/env.js";
import { logger } from "../../config/logger.js";
import { BaseError } from "../errors/BaseError.js";
import { sendLegacyError } from "../responses/apiResponse.js";

/**
 * Global error middleware.
 * Keeps legacy `{ message }` body so storefront/admin do not break.
 * Never leaks stack traces, secrets, or DB internals to clients.
 */
export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction): void {
  const requestId = (req as Request & { requestId?: string }).requestId;

  if (err instanceof BaseError) {
    if (!err.isOperational) {
      logger.error({ requestId, code: err.code, err }, err.message);
    } else {
      logger.warn({ requestId, code: err.code, statusCode: err.statusCode }, err.message);
    }
    sendLegacyError(res, err.message, err.statusCode);
    return;
  }

  if (err instanceof ZodError) {
    const message = err.issues.map((i) => i.message).join("; ");
    sendLegacyError(res, message || "Validation failed", 400);
    return;
  }

  if (err instanceof mongoose.Error.ValidationError) {
    sendLegacyError(res, "Validation failed", 400);
    logger.warn({ requestId, err: err.message }, "Mongoose validation error");
    return;
  }

  if (err instanceof multer.MulterError) {
    sendLegacyError(res, err.code === "LIMIT_FILE_SIZE" ? "File too large" : "Upload failed", 400);
    return;
  }

  logger.error(
    {
      requestId,
      err:
        err instanceof Error
          ? { message: err.message, name: err.name, stack: isProduction ? undefined : err.stack }
          : typeof err === "object" && err !== null
            ? err
            : String(err),
    },
    "Unhandled error"
  );
  sendLegacyError(res, "Internal server error", 500);
}
