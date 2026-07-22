import type { NextFunction, Request, Response } from "express";
import type { ZodTypeAny } from "zod";
import { AppError } from "../errors/AppError.js";

type RequestPart = "body" | "query" | "params";

export function validate(schema: ZodTypeAny, part: RequestPart = "body") {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const parsed = schema.safeParse(req[part]);
    if (!parsed.success) {
      const message = parsed.error.issues.map((i) => i.message).join("; ");
      next(new AppError(400, message || "Validation failed"));
      return;
    }
    (req as Request & { validated?: unknown }).validated = parsed.data;
    if (part === "body") req.body = parsed.data;
    next();
  };
}
