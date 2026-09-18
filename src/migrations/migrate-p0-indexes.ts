import mongoose from "mongoose";
import { connectDatabase, disconnectDatabase } from "../config/database.js";
import { Product } from "../models/Product.js";
import { InventoryReservation } from "../modules/inventory/reservation.model.js";
import { WebhookEvent } from "../modules/webhook/webhook-event.model.js";
import { seedPromotionalGift } from "../seed/seed-promotional-gift.js";
import { logger } from "../config/logger.js";

/**
 * Migration script for P0 Production Blockers:
 * - Backfills Product fields (reservedStock, inventoryTracked, isPromotionalGift)
 * - Builds compound indexes for InventoryReservation and WebhookEvent
 * - Seeds the GIFT799 promotional product idempotently
 */
export async function runP0Migration(): Promise<void> {
  logger.info("[Migration:P0] Starting P0 database migration...");

  // 1. Backfill Product fields for backward compatibility
  const productUpdateResult = await Product.updateMany(
    {
      $or: [
        { reservedStock: { $exists: false } },
        { inventoryTracked: { $exists: false } },
        { isPromotionalGift: { $exists: false } },
      ],
    },
    {
      $set: {
        reservedStock: 0,
        inventoryTracked: true,
        isPromotionalGift: false,
      },
    }
  );
  logger.info(
    `[Migration:P0] Updated ${productUpdateResult.modifiedCount} existing products with default reservation fields.`
  );

  // 2. Ensure InventoryReservation indexes
  await InventoryReservation.createIndexes();
  logger.info("[Migration:P0] Created InventoryReservation indexes.");

  // 3. Ensure WebhookEvent indexes
  await WebhookEvent.createIndexes();
  logger.info("[Migration:P0] Created WebhookEvent indexes.");

  // 4. Seed promotional gift GIFT799
  const gift = await seedPromotionalGift();
  logger.info(`[Migration:P0] Seeded promotional gift product: ${gift.sku} (ID: ${gift._id})`);

  logger.info("[Migration:P0] P0 database migration completed successfully.");
}

// Allow CLI execution: tsx src/migrations/migrate-p0-indexes.ts
if (import.meta.url === `file://${process.argv[1]}`) {
  connectDatabase()
    .then(() => runP0Migration())
    .then(() => disconnectDatabase())
    .then(() => process.exit(0))
    .catch((err) => {
      logger.error(err, "[Migration:P0] Migration failed");
      process.exit(1);
    });
}
