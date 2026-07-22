import rateLimit from "express-rate-limit";
import slowDown from "express-slow-down";
import { env, isProduction } from "../../config/env.js";
import { logSecurityEvent } from "../../config/logger.js";

const legacyMessage = { message: "Too many requests, please try again later." };

export const globalRateLimiter = rateLimit({
  windowMs: env.RATE_LIMIT_WINDOW_MS,
  max: isProduction ? env.RATE_LIMIT_MAX : env.RATE_LIMIT_MAX * 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: legacyMessage,
  handler: (req, res, _next, options) => {
    logSecurityEvent("rate_limit_global", {
      ip: req.ip,
      path: req.originalUrl,
      requestId: (req as { requestId?: string }).requestId,
    });
    res.status(options.statusCode).json(options.message);
  },
});

export const authRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: isProduction ? 20 : 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Too many authentication attempts. Try again later." },
  handler: (req, res, _next, options) => {
    logSecurityEvent("rate_limit_auth", { ip: req.ip, path: req.originalUrl });
    res.status(options.statusCode).json(options.message);
  },
});

export const adminLoginRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: isProduction ? 10 : 50,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Too many admin login attempts. Try again later." },
  handler: (req, res, _next, options) => {
    logSecurityEvent("rate_limit_admin_login", { ip: req.ip, path: req.originalUrl });
    res.status(options.statusCode).json(options.message);
  },
});

export const otpRateLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: isProduction ? 5 : 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Too many OTP requests. Try again later." },
});

export const paymentRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: isProduction ? 40 : 200,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Too many payment requests. Try again later." },
  handler: (req, res, _next, options) => {
    logSecurityEvent("rate_limit_payment", { ip: req.ip, path: req.originalUrl });
    res.status(options.statusCode).json(options.message);
  },
});

/** Progressive delay before hard rate-limit on login. */
export const authSlowDown = slowDown({
  windowMs: 15 * 60 * 1000,
  delayAfter: isProduction ? 5 : 20,
  delayMs: (hits) => Math.min(hits * 250, 3000),
  maxDelayMs: 5000,
  validate: { delayMs: false },
});

export const otpSlowDown = slowDown({
  windowMs: 10 * 60 * 1000,
  delayAfter: 2,
  delayMs: () => 750,
  maxDelayMs: 4000,
  validate: { delayMs: false },
});
