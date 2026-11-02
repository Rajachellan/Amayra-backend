import { logger } from "../../config/logger.js";
import { processExpiredCredits, processExpiredCreditReservations } from "./credit.service.js";

let intervalRef: NodeJS.Timeout | null = null;

export function startCreditExpiryWorker(intervalMs = 5 * 60 * 1000): void {
  if (intervalRef) return;

  async function tick() {
    try {
      const expiredCount = await processExpiredCredits();
      if (expiredCount > 0) {
        logger.info(`[CreditExpiryWorker] Auto-expired ${expiredCount} overdue store credit(s).`);
      }

      const releasedCount = await processExpiredCreditReservations();
      if (releasedCount > 0) {
        logger.info(
          `[CreditExpiryWorker] Released ${releasedCount} timed-out checkout credit reservation(s).`
        );
      }
    } catch (err) {
      logger.error({ err }, "[CreditExpiryWorker] Sweep failure");
    }
  }

  // Initial check
  void tick();

  intervalRef = setInterval(tick, intervalMs);
  if (intervalRef.unref) intervalRef.unref();

  logger.info("[CreditExpiryWorker] Started store credit expiry & reservation sweep.");
}

export function stopCreditExpiryWorker(): void {
  if (intervalRef) {
    clearInterval(intervalRef);
    intervalRef = null;
  }
}
