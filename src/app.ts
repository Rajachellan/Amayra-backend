import express from "express";
import cors from "cors";
import path from "path";
import { router } from "./routes/index.js";
import { errorHandler } from "./middleware/errorHandler.js";
import { postRazorpayWebhook } from "./controllers/razorpayWebhookController.js";

const webhookRaw = express.raw({ type: "application/json", limit: "2mb" });

export function createApp() {
  const app = express();
  const corsAllowList = process.env.CORS_ORIGIN?.split(",").map((s) => s.trim()).filter(Boolean) ?? [];
  const isDev = process.env.NODE_ENV !== "production";
  const lanOrigin =
    /^https?:\/\/(localhost|127\.0\.0\.1|192\.168\.\d{1,3}\.\d{1,3}|10\.\d{1,3}\.\d{1,3}\.\d{1,3})(:\d+)?$/;

  app.post("/webhooks/razorpay", webhookRaw, postRazorpayWebhook);
  app.post("/api/webhooks/razorpay", webhookRaw, postRazorpayWebhook);

  app.use(
    cors({
      origin(origin, callback) {
        if (!origin) return callback(null, true);
        if (corsAllowList.length === 0) return callback(null, true);
        if (corsAllowList.includes(origin)) return callback(null, true);
        if (isDev && lanOrigin.test(origin)) return callback(null, true);
        callback(null, false);
      },
      credentials: true,
    })
  );

  app.use(express.json({ limit: "2mb" }));

  app.use("/uploads", express.static(path.join(process.cwd(), "uploads")));

  app.get("/health", (_req, res) => {
    res.json({ ok: true });
  });

  app.use("/api", router);
  app.use(router);
  app.use(errorHandler);
  return app;
}
