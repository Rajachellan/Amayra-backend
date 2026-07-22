import { BaseError } from "./BaseError.js";

export class ValidationError extends BaseError {
  constructor(message = "Validation failed", details?: unknown) {
    super(400, message, { code: "VALIDATION_ERROR", details });
  }
}

export class UnauthorizedError extends BaseError {
  constructor(message = "Unauthorized") {
    super(401, message, { code: "UNAUTHORIZED" });
  }
}

export class ForbiddenError extends BaseError {
  constructor(message = "Forbidden") {
    super(403, message, { code: "FORBIDDEN" });
  }
}

export class NotFoundError extends BaseError {
  constructor(message = "Resource not found") {
    super(404, message, { code: "NOT_FOUND" });
  }
}

export class ConflictError extends BaseError {
  constructor(message = "Conflict") {
    super(409, message, { code: "CONFLICT" });
  }
}

export class DatabaseError extends BaseError {
  constructor(message = "Database error", details?: unknown) {
    super(500, message, { code: "DATABASE_ERROR", details, isOperational: false });
  }
}

export class ExternalServiceError extends BaseError {
  constructor(message = "External service error", details?: unknown) {
    super(502, message, { code: "EXTERNAL_SERVICE_ERROR", details });
  }
}
