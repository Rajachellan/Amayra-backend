import mongoose from "mongoose";
import { Order } from "../order/model.js";
import { Payment } from "./model.js";
import { decrementStockForOrder } from "../inventory/inventory.service.js";
import { recordOrderEvent } from "../order/order.service.js";
import { AppError } from "../../utils/AppError.js";

/**
 * Handles prepaid capture from either verify checkout API or webhook.
 * Executes stock updates and status transitions inside a MongoDB transaction.
 */
export async function processPrepaidPaymentCapture(args: {
  paymentDocId: mongoose.Types.ObjectId;
  razorpayPaymentId?: string;
  razorpaySignature?: string | null;
  method?: string;
  appendRaw?: Record<string, any>;
}): Promise<{ alreadyDone: boolean }> {
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

    // 1. Decrement Stock atomically
    await decrementStockForOrder(session, order, "RAZORPAY");

    // 2. Update Payment document
    payment.status = "captured";
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
    await session.abortTransaction();
    session.endSession();
    throw err;
  }
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
}
