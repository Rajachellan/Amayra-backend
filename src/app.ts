import express from "express";
import cors from "cors";
import path from "path";
import { router } from "./routes/index.js";
import { errorHandler } from "./middleware/errorHandler.js";
import { postRazorpayWebhook } from "./controllers/razorpayWebhookController.js";

const webhookRaw = express.raw({ type: "application/json", limit: "2mb" });

export function createApp() {
  const app = express();
  const corsOrigin = process.env.CORS_ORIGIN?.split(",").map((s) => s.trim()) ?? "*";

  app.post("/webhooks/razorpay", webhookRaw, postRazorpayWebhook);
  app.post("/api/webhooks/razorpay", webhookRaw, postRazorpayWebhook);

  app.use(
    cors({
      origin: corsOrigin === "*" ? true : corsOrigin,
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
