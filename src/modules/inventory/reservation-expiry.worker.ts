import { Product } from "../../models/Product.js";
import { InventoryReservation } from "./reservation.model.js";
import { recordOrderEvent } from "../order/order.service.js";
import { logger } from "../../config/logger.js";

/**
 * Sweeps for expired inventory reservations, atomically claims them,
 * and restores available stock while decrementing reservedStock.
 * Safe for multi-instance deployments.
 */
export async function processExpiredReservations(): Promise<number> {
  const now = new Date();
  const expiredCandidates = await InventoryReservation.find({
    status: "ACTIVE",
    expiresAt: { $lte: now },
  }).limit(100);

  let processedCount = 0;

  for (const candidate of expiredCandidates) {
    try {
      // 1. Atomic claim: transition ACTIVE -> EXPIRED
      const claimed = await InventoryReservation.findOneAndUpdate(
        { _id: candidate._id, status: "ACTIVE" },
        {
          $set: {
            status: "EXPIRED",
            expiredAt: new Date(),
            releaseReason: "RESERVATION_TIMEOUT",
          },
        },
        { new: true }
      );

      // Race-safe: If another worker or payment conversion claimed it, skip
      if (!claimed) continue;

      // 2. Restore stock and decrement reservedStock for each tracked item
      for (const item of claimed.items) {
        await Product.updateOne(
          { _id: item.productId },
          {
            $inc: {
              stock: item.quantity,
              reservedStock: -item.quantity,
            },
          }
        );
      }

      // 3. Record OrderHistory audit event
      await recordOrderEvent({
        orderId: claimed.orderId,
        eventType: "RESERVATION_EXPIRED",
        source: "SYSTEM",
        metadata: {
          reservationId: claimed.reservationId,
          expiredAt: claimed.expiredAt,
          itemsCount: claimed.items.length,
          releaseReason: "RESERVATION_TIMEOUT",
        },
      });

      logger.info(
        `[ReservationExpiryWorker] Expired reservation ${claimed.reservationId} for order ${claimed.orderId}. Restored stock for ${claimed.items.length} item(s).`
      );
      processedCount++;
    } catch (err) {
      logger.error(
        { err, reservationId: candidate.reservationId, orderId: candidate.orderId },
        "[ReservationExpiryWorker] Failed to process expired reservation"
      );
    }
  }

  return processedCount;
}

let workerInterval: NodeJS.Timeout | null = null;

/**
 * Starts the reservation expiry worker running every intervalMs (default 60 seconds).
 */
export function startReservationExpiryWorker(intervalMs = 60000): void {
  if (workerInterval) return;

  workerInterval = setInterval(() => {
    processExpiredReservations().catch((err) =>
      logger.error(err, "[ReservationExpiryWorker] Error during worker execution")
    );
  }, intervalMs);

  logger.info(`[ReservationExpiryWorker] Initialized — running every ${intervalMs / 1000}s`);
}

/**
 * Stops the reservation expiry worker interval.
 */
export function stopReservationExpiryWorker(): void {
  if (workerInterval) {
    clearInterval(workerInterval);
    workerInterval = null;
    logger.info("[ReservationExpiryWorker] Stopped");
  }
}
