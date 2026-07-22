import type { Response } from "express";

/**
 * Enterprise response helpers.
 *
 * IMPORTANT: Existing storefront + admin clients expect legacy shapes
 * (flat JSON or `{ message }` on errors). Prefer `sendLegacy` / direct
 * `res.json(payload)` for existing routes. Use `sendSuccess` only for
 * new versioned endpoints.
 */

export type ApiMeta = Record<string, unknown>;

export function sendSuccess<T>(
  res: Response,
  data: T,
  options?: { message?: string; statusCode?: number; meta?: ApiMeta }
): void {
  res.status(options?.statusCode ?? 200).json({
    success: true,
    message: options?.message ?? "OK",
    data,
    meta: options?.meta ?? null,
  });
}

export function sendFailure(
  res: Response,
  message: string,
  options?: { statusCode?: number; errors?: unknown }
): void {
  res.status(options?.statusCode ?? 400).json({
    success: false,
    message,
    errors: options?.errors ?? null,
  });
}

/** Preserve exact legacy payload (no envelope) — required for current frontend. */
export function sendLegacy<T>(res: Response, payload: T, statusCode = 200): void {
  res.status(statusCode).json(payload);
}

/** Legacy error body used by existing clients. */
export function sendLegacyError(res: Response, message: string, statusCode: number): void {
  res.status(statusCode).json({ message });
}
