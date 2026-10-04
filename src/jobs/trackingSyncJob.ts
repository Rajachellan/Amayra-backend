import cron from "node-cron";
import { logger } from "../config/logger.js";
import { syncAllActiveShipments } from "../modules/shipping/shipping.service.js";

/**
 * Runs every 30 minutes to check all in-transit or processing shipments with Shiprocket.
 * Automatically updates delivered statuses, AWB progress, and timestamps.
 */
export function startTrackingSyncJob(): void {
  // Run every 30 minutes: "*/30 * * * *"
  cron.schedule("*/30 * * * *", async () => {
    try {
      logger.info("[trackingSyncJob] Starting scheduled Shiprocket tracking poll...");
      const result = await syncAllActiveShipments();
      logger.info(
        `[trackingSyncJob] Completed. Checked ${result.totalChecked} orders, updated ${result.totalUpdated}.`
      );
    } catch (err: any) {
      logger.error({ err }, "[trackingSyncJob] Error during scheduled tracking poll");
    }
  });

  logger.info("[trackingSyncJob] Background shipment tracking cron initialized (every 30m)");
}
