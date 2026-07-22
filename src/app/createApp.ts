import express from "express";
import cors from "cors";
import helmet from "helmet";
import compression from "compression";
import cookieParser from "cookie-parser";
import hpp from "hpp";
import mongoSanitize from "express-mongo-sanitize";
import path from "path";
import { corsOptions } from "../config/cors.js";
import { isProduction } from "../config/env.js";
import {
  errorHandler,
  requestIdMiddleware,
  requestLoggerMiddleware,
} from "../common/middleware/index.js";
import { globalRateLimiter } from "../common/middleware/rateLimiters.js";
import { sanitizeInputMiddleware } from "../common/middleware/sanitizeInput.js";
import { registerRoutes } from "./routes.js";
import { postRazorpayWebhook } from "../modules/payment/webhook.controller.js";

const webhookRaw = express.raw({ type: "application/json", limit: "2mb" });

export function createApp() {
  const app = express();

  app.set("trust proxy", 1);
  app.disable("x-powered-by");

  app.use(requestIdMiddleware);

  app.use(
    helmet({
      contentSecurityPolicy: isProduction
        ? {
            useDefaults: true,
            directives: {
              defaultSrc: ["'self'"],
              scriptSrc: ["'self'"],
              styleSrc: ["'self'", "'unsafe-inline'"],
              imgSrc: ["'self'", "data:", "https:"],
              connectSrc: ["'self'", "https:"],
              fontSrc: ["'self'", "https:", "data:"],
              objectSrc: ["'none'"],
              frameAncestors: ["'none'"],
              baseUri: ["'self'"],
              formAction: ["'self'"],
            },
          }
        : false,
      frameguard: { action: "deny" },
      hsts: isProduction
        ? { maxAge: 31536000, includeSubDomains: true, preload: true }
        : false,
      noSniff: true,
      referrerPolicy: { policy: "strict-origin-when-cross-origin" },
      crossOriginEmbedderPolicy: false,
      crossOriginOpenerPolicy: { policy: "same-origin" },
      crossOriginResourcePolicy: { policy: "cross-origin" },
      permittedCrossDomainPolicies: { permittedPolicies: "none" },
      hidePoweredBy: true,
      xssFilter: true,
    })
  );

  app.use((req, res, next) => {
    res.setHeader(
      "Permissions-Policy",
      "camera=(), microphone=(), geolocation=(), payment=(self), interest-cohort=()"
    );
    res.removeHeader("Server");
    next();
  });

  app.use(
    compression({
      threshold: 1024,
      filter: (req, res) => {
        if (req.headers["x-no-compression"]) return false;
        return compression.filter(req, res);
      },
    })
  );

  app.use(cors(corsOptions));
  app.use(globalRateLimiter);
  app.use(cookieParser());

  // Razorpay webhooks need raw body — register before JSON parser
  app.post("/webhooks/razorpay", webhookRaw, postRazorpayWebhook);
  app.post("/api/webhooks/razorpay", webhookRaw, postRazorpayWebhook);

  app.use(express.json({ limit: "1mb" }));
  app.use(express.urlencoded({ extended: false, limit: "1mb" }));
  app.use(hpp());
  app.use(
    mongoSanitize({
      replaceWith: "_",
      allowDots: false,
    })
  );
  app.use(sanitizeInputMiddleware);
  app.use(requestLoggerMiddleware);

  app.use("/uploads", express.static(path.join(process.cwd(), "uploads"), {
    dotfiles: "deny",
    index: false,
    maxAge: isProduction ? "1d" : 0,
  }));

  app.get("/health", (_req, res) => {
    res.json({ ok: true });
  });

  registerRoutes(app);
  app.use(errorHandler);
  return app;
}
