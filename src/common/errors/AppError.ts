import { BaseError } from "./BaseError.js";

/**
 * Legacy-compatible error used across the codebase.
 * Prefer typed errors (ValidationError, NotFoundError, …) in new code.
 * Response shape remains `{ message }` for frontend compatibility.
 */
export class AppError extends BaseError {
  constructor(statusCode: number, message: string) {
    super(statusCode, message, { code: "APP_ERROR" });
    this.name = "AppError";
  }
}
