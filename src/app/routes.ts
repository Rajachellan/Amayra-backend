import type { Express } from "express";
import { router as legacyRouter } from "../routes/index.js";

/**
 * Route registration entrypoint.
 * Currently mounts the production-compatible legacy router (same paths + payloads).
 * Module routers are extracted incrementally under modules/[name]/routes.ts.
 */
export function registerRoutes(app: Express): void {
  app.use("/api", legacyRouter);
  app.use(legacyRouter);
}
