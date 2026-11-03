import mongoose from "mongoose";
import { Order } from "../order/model.js";
import { Payment } from "./model.js";
import { decrementStockForOrder } from "../inventory/inventory.service.js";
import { recordOrderEvent } from "../order/order.service.js";
import { AppError } from "../../utils/AppError.js";
import { logger } from "../../config/logger.js";

function isTransientMongoError(err: any): boolean {
  if (!err) return false;
  if (typeof err.hasErrorLabel === "function" && err.hasErrorLabel("TransientTransactionError")) {
    return true;
  }
  return err.code === 112 || err.codeName === "WriteConflict";
}

/**
 * Handles prepaid capture from verify checkout API, webhook, or payment reconciliation.
 * Executes stock updates and status transitions inside a MongoDB transaction with WriteConflict retry.
 */
export async function processPrepaidPaymentCapture(args: {
  paymentDocId: mongoose.Types.ObjectId;
  razorpayPaymentId?: string;
  razorpaySignature?: string | null;
  method?: string;
  appendRaw?: Record<string, any>;
}): Promise<{ alreadyDone: boolean }> {
  const maxAttempts = 4;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const session = await mongoose.startSession();
    session.startTransaction();
    try {
      const payment = await Payment.findById(args.paymentDocId).session(session);
      if (!payment || !payment.order) {
        await session.abortTransaction();
        session.endSession();
        throw new AppError(404, "Payment not found");
      }
      if (payment.status === "captured") {
        await session.commitTransaction();
        session.endSession();
        return { alreadyDone: true };
      }

      const order = await Order.findById(payment.order).session(session);
      if (!order) {
        await session.abortTransaction();
        session.endSession();
        throw new AppError(404, "Order not found");
      }

      if (order.paymentStatus === "CAPTURED") {
        await session.commitTransaction();
        session.endSession();
        return { alreadyDone: true };
      }

      const previousOrderStatus = order.orderStatus;

      // 1. Convert Reservation to Sale atomically (recovering RELEASED/EXPIRED if needed)
      const { convertReservationsToSale } = await import("../inventory/inventory.service.js");
      await convertReservationsToSale(session, order, payment._id.toString(), "RAZORPAY");

      // 2. Update Payment document (clearing any stale failureReason from earlier attempt)
      payment.status = "captured";
      payment.failureReason = undefined;
      if (args.razorpayPaymentId) payment.razorpayPaymentId = args.razorpayPaymentId;
      if (args.razorpaySignature !== undefined) {
        payment.razorpaySignature = args.razorpaySignature ?? undefined;
      }
      if (args.method) payment.method = args.method;
      if (args.appendRaw) {
        payment.rawPayload = { ...(payment.rawPayload ?? {}), ...args.appendRaw };
      }
      await payment.save({ session });

      // 3. Update Order document
      order.orderStatus = "CONFIRMED";
      order.paymentStatus = "CAPTURED";
      order.status = "paid"; // Sync legacy status
      order.paymentInfo.status = "CAPTURED";
      if (args.razorpayPaymentId) {
        order.paymentInfo.razorpayPaymentId = args.razorpayPaymentId;
      }
      await order.save({ session });

      // Commit any reserved store credit within the same transaction
      if (order.storeCreditsUsed && (order.storeCreditsUsed as any[]).length > 0) {
        const { commitStoreCreditReservations } = await import("../credit/credit.service.js");
        await commitStoreCreditReservations({ orderId: order._id, session });
      }

      await session.commitTransaction();
      session.endSession();

      // 4. Record history & notify Socket.IO (outside transaction)
      await recordOrderEvent({
        orderId: order._id,
        eventType: "PAYMENT_CAPTURED",
        previousStatus: previousOrderStatus,
        newStatus: "CONFIRMED",
        source: "RAZORPAY",
        metadata: {
          paymentId: payment._id.toString(),
          razorpayPaymentId: args.razorpayPaymentId,
          paymentStatus: "CAPTURED",
          method: args.method,
        },
      });

      return { alreadyDone: false };
    } catch (err) {
      await session.abortTransaction().catch(() => {});
      session.endSession();

      if (isTransientMongoError(err) && attempt < maxAttempts) {
        logger.warn(
          { paymentDocId: args.paymentDocId.toString(), attempt },
          "[PaymentCapture] Transient MongoDB transaction conflict; retrying..."
        );
        await new Promise((r) => setTimeout(r, 60 * attempt));
        continue;
      }
      throw err;
    }
  }

  throw new AppError(500, "Failed to process payment capture after retries");
}

/**
 * Handles payment failure webhook or client failure alerts.
 */
export async function processPaymentFailure(
  paymentId: mongoose.Types.ObjectId,
  reason?: string,
  appendRaw?: Record<string, any>
): Promise<void> {
  const payment = await Payment.findById(paymentId);
  if (!payment) return;
  if (payment.status === "captured") return;

  const order = await Order.findById(payment.order);
  if (!order) return;
  if (
    order.paymentStatus === "CAPTURED" ||
    ["paid", "processing", "shipped", "delivered"].includes(order.status as string)
  ) {
    return;
  }

  // Multi-attempt safeguard: check if another attempt on the same Razorpay order already captured
  if (payment.razorpayOrderId) {
    try {
      const { getRazorpay } = await import("../../integrations/razorpay/service.js");
      const rzp = getRazorpay();
      const paymentsRes: any = await (rzp.orders as any).fetchPayments(payment.razorpayOrderId);
      const items: any[] = Array.isArray(paymentsRes?.items) ? paymentsRes.items : [];
      const capturedAttempt = items.find((p) => p?.status === "captured");
      if (capturedAttempt) {
        logger.info(
          {
            orderNumber: order.orderNumber,
            razorpayOrderId: payment.razorpayOrderId,
            razorpayPaymentId: capturedAttempt.id,
          },
          "[PaymentFailure] Skipping failure transition because Razorpay order already has a captured payment; capturing instead."
        );
        await processPrepaidPaymentCapture({
          paymentDocId: payment._id,
          razorpayPaymentId: capturedAttempt.id,
          method: capturedAttempt.method,
          appendRaw: {
            ...(appendRaw ?? {}),
            recoveredDuringFailureWebhook: true,
            capturedPayment: capturedAttempt,
          },
        });
        return;
      }
    } catch (rzErr) {
      logger.warn(
        { err: rzErr, razorpayOrderId: payment.razorpayOrderId },
        "[PaymentFailure] Could not verify Razorpay order payments before failure transition"
      );
    }
  }

  const previousOrderStatus = order.orderStatus;

  payment.status = "failed";
  payment.failureReason = reason ?? payment.failureReason;
  if (appendRaw) {
    payment.rawPayload = { ...(payment.rawPayload ?? {}), ...appendRaw };
  }
  await payment.save();

  order.orderStatus = "CANCELLED";
  order.paymentStatus = "FAILED";
  order.status = "failed"; // legacy sync
  order.paymentInfo.status = "FAILED";
  await order.save();

  await recordOrderEvent({
    orderId: order._id,
    eventType: "PAYMENT_FAILED",
    previousStatus: previousOrderStatus,
    newStatus: "CANCELLED",
    source: "RAZORPAY",
    metadata: {
      paymentId: payment._id.toString(),
      failureReason: reason,
    },
  });

  // Release any active inventory reservations
  const { releaseInventoryReservations } = await import("../inventory/inventory.service.js");
  await releaseInventoryReservations(order._id, reason || "PAYMENT_FAILED", "RAZORPAY");

  // Release any active store credit reservations
  if (order.storeCreditsUsed && (order.storeCreditsUsed as any[]).length > 0) {
    const { releaseStoreCreditReservations } = await import("../credit/credit.service.js");
    await releaseStoreCreditReservations({
      orderId: order._id,
      reason: reason || "PAYMENT_FAILED",
    });
  }
}
