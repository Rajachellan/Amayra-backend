import express from "express";
import cors from "cors";
import path from "path";
import { router } from "./routes/index.js";
import { errorHandler } from "./middleware/errorHandler.js";

export function createApp() {
  const app = express();
  const corsOrigin = process.env.CORS_ORIGIN?.split(",").map((s) => s.trim()) ?? "*";
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

  // Optional prefix so clients can use NEXT_PUBLIC_API_URL=http://localhost:PORT/api
  app.use("/api", router);
  app.use(router);
  app.use(errorHandler);
  return app;
}
