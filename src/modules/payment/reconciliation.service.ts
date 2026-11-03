import { Payment } from "./model.js";
import { Order } from "../order/model.js";
import { InventoryReservation } from "../inventory/reservation.model.js";
import { WebhookEvent } from "../webhook/webhook-event.model.js";
import { getRazorpay } from "../../integrations/razorpay/service.js";
import { processPrepaidPaymentCapture } from "./payment.service.js";
import { logger } from "../../config/logger.js";

export type ReconciledOrderSummary = {
  orderId: string;
  orderNumber: string;
  razorpayOrderId: string;
  razorpayPaymentId: string;
  amount: number;
  alreadyDone: boolean;
};

export type ReconcileResult = {
  checked: number;
  reconciledCount: number;
  reconciledOrders: ReconciledOrderSummary[];
};

let reconciliationInFlight = false;
let workerInterval: NodeJS.Timeout | null = null;

/**
 * Queries Razorpay for recent payments still marked `created` or `failed` locally
 * and promotes any captured payments to `CONFIRMED` / `paid` / `CAPTURED`.
 */
export async function reconcilePendingRazorpayPayments(options?: {
  lookbackDays?: number;
  limit?: number;
}): Promise<ReconcileResult> {
  if (!process.env.RAZORPAY_KEY_ID || !process.env.RAZORPAY_KEY_SECRET) {
    return { checked: 0, reconciledCount: 0, reconciledOrders: [] };
  }

  if (reconciliationInFlight) {
    return { checked: 0, reconciledCount: 0, reconciledOrders: [] };
  }

  reconciliationInFlight = true;
  try {
    const lookbackDays = Math.max(1, Math.min(60, options?.lookbackDays ?? 14));
    const limit = Math.max(1, Math.min(200, options?.limit ?? 100));
    const cutoff = new Date(Date.now() - lookbackDays * 24 * 60 * 60 * 1000);

    const candidates = await Payment.find({
      status: { $in: ["created", "failed"] },
      razorpayOrderId: { $exists: true, $nin: [null, ""] },
      createdAt: { $gte: cutoff },
    })
      .sort({ createdAt: -1 })
      .limit(limit);

    if (candidates.length === 0) {
      return { checked: 0, reconciledCount: 0, reconciledOrders: [] };
    }

    const rzp = getRazorpay();
    const reconciledOrders: ReconciledOrderSummary[] = [];

    for (const payment of candidates) {
      const rzOrderId = payment.razorpayOrderId;
      if (!rzOrderId || !payment.order) continue;

      try {
        const res: any = await (rzp.orders as any).fetchPayments(rzOrderId);
        const items: any[] = Array.isArray(res?.items) ? res.items : [];
        const captured = items.find((p) => p?.status === "captured");
        if (!captured) continue;

        const captureResult = await processPrepaidPaymentCapture({
          paymentDocId: payment._id,
          razorpayPaymentId: captured.id,
          method: captured.method,
          appendRaw: {
            reconciledAt: new Date().toISOString(),
            source: "razorpay_reconciliation",
            razorpayPayment: {
              id: captured.id,
              order_id: captured.order_id,
              amount: captured.amount,
              status: captured.status,
              method: captured.method,
              created_at: captured.created_at,
            },
          },
        });

        // Mark any previously failed Razorpay webhook events for this reservation as resolved
        const reservation = await InventoryReservation.findOne({ orderId: payment.order })
          .select("reservationId")
          .lean();
        if (reservation?.reservationId) {
          await WebhookEvent.updateMany(
            {
              provider: "RAZORPAY",
              processed: false,
              error: { $regex: reservation.reservationId },
            },
            {
              $set: { processed: true, processedAt: new Date() },
              $unset: { error: 1 },
            }
          );
        }

        const order = await Order.findById(payment.order).select("orderNumber total").lean();
        const summary: ReconciledOrderSummary = {
          orderId: String(payment.order),
          orderNumber: order?.orderNumber ?? "",
          razorpayOrderId: rzOrderId,
          razorpayPaymentId: String(captured.id),
          amount: order?.total ?? Math.round((payment.amount ?? 0) / 100),
          alreadyDone: captureResult.alreadyDone,
        };
        reconciledOrders.push(summary);

        logger.info(
          summary,
          "[PaymentReconciliation] Reconciled captured Razorpay payment into paid order"
        );
      } catch (err) {
        logger.error(
          { err, paymentId: payment._id.toString(), razorpayOrderId: rzOrderId },
          "[PaymentReconciliation] Failed reconciling payment candidate"
        );
      }
    }

    return {
      checked: candidates.length,
      reconciledCount: reconciledOrders.filter((r) => !r.alreadyDone).length,
      reconciledOrders,
    };
  } finally {
    reconciliationInFlight = false;
  }
}

/**
 * Starts periodic Razorpay payment reconciliation (runs once after startup + every intervalMs).
 */
export function startPaymentReconciliationWorker(intervalMs = 5 * 60 * 1000): void {
  if (workerInterval) return;

  // Run an initial sweep right after server boot
  void reconcilePendingRazorpayPayments().catch((err) =>
    logger.error({ err }, "[PaymentReconciliation] Initial sweep error")
  );

  workerInterval = setInterval(() => {
    reconcilePendingRazorpayPayments().catch((err) =>
      logger.error({ err }, "[PaymentReconciliation] Periodic sweep error")
    );
  }, intervalMs);

  logger.info(
    `[PaymentReconciliation] Initialized — running every ${Math.round(intervalMs / 1000)}s`
  );
}

export function stopPaymentReconciliationWorker(): void {
  if (workerInterval) {
    clearInterval(workerInterval);
    workerInterval = null;
    logger.info("[PaymentReconciliation] Stopped");
  }
}
