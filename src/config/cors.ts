import type { CorsOptions } from "cors";
import { env, isDevelopment, isProduction } from "./env.js";
import { logSecurityEvent } from "./logger.js";

const allowList = env.CORS_ORIGIN.split(",").map((s) => s.trim()).filter(Boolean);
const lanOrigin =
  /^https?:\/\/(localhost|127\.0\.0\.1|192\.168\.\d{1,3}\.\d{1,3}|10\.\d{1,3}\.\d{1,3}\.\d{1,3})(:\d+)?$/;
const mairiijewelsOrigin = /^https:\/\/([a-z0-9-]+\.)*mairiijewels\.com$/i;

export const corsOptions: CorsOptions = {
  origin(origin, callback) {
    // Non-browser clients (curl, server-to-server) often omit Origin
    if (!origin) return callback(null, true);

    if (allowList.includes(origin)) return callback(null, true);
    if (mairiijewelsOrigin.test(origin)) return callback(null, true);
    if (isDevelopment && lanOrigin.test(origin)) return callback(null, true);

    // Never allow wildcard in production when list is empty — reject unknown origins
    if (!isProduction && allowList.length === 0) return callback(null, true);

    logSecurityEvent("cors_blocked", { origin });
    callback(null, false);
  },
  credentials: true,
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization", "X-Request-Id"],
  exposedHeaders: ["X-Request-Id"],
  maxAge: 600,
};
