import { OrderHistory } from "./order-history.model.js";
import { Order } from "./model.js";
import { emitToAdmins } from "../../config/socket.js";
import { logger } from "../../config/logger.js";
import mongoose from "mongoose";

export type OrderEventSource = "CUSTOMER" | "ADMIN" | "RAZORPAY" | "SHIPROCKET" | "SYSTEM";

/**
 * Creates an audit log entry for an order and dispatches Socket.IO real-time updates.
 */
export async function recordOrderEvent(args: {
  orderId: string | mongoose.Types.ObjectId;
  eventType: string;
  previousStatus?: string;
  newStatus?: string;
  source: OrderEventSource;
  metadata?: Record<string, any>;
}): Promise<void> {
  try {
    const oid = typeof args.orderId === "string" ? new mongoose.Types.ObjectId(args.orderId) : args.orderId;
    
    // Write to audit log in MongoDB
    await OrderHistory.create({
      orderId: oid,
      eventType: args.eventType,
      previousStatus: args.previousStatus,
      newStatus: args.newStatus,
      source: args.source,
      metadata: args.metadata || {},
    });

    logger.info(
      `OrderEvent recorded: Order [${oid.toString()}] - Event '${args.eventType}' from ${args.source}`
    );

    // Fetch the updated order to broadcast latest statuses
    const order = await Order.findById(oid).lean();
    if (!order) return;

    // Map the eventType to the correct socket namespace event
    const payload = {
      orderId: order._id.toString(),
      orderNumber: order.orderNumber,
      orderStatus: order.orderStatus,
      paymentStatus: order.paymentStatus,
      shippingStatus: order.shippingStatus,
      returnStatus: order.returnStatus,
      refundStatus: order.refundStatus,
      paymentMethod: order.paymentMethod,
    };

    // Emit broad updates
    emitToAdmins("order.updated", payload);

    if (args.eventType.startsWith("PAYMENT_")) {
      emitToAdmins("payment.updated", payload);
      if (args.eventType === "PAYMENT_CAPTURED") {
        emitToAdmins("payment.captured", payload);
      } else if (args.eventType === "PAYMENT_FAILED") {
        emitToAdmins("payment.failed", payload);
      } else if (args.eventType === "PAYMENT_REFUNDED") {
        emitToAdmins("payment.refunded", payload);
      }
    }

    if (args.eventType.startsWith("SHIPMENT_") || args.eventType.startsWith("AWB_") || args.eventType.startsWith("PICKUP_")) {
      emitToAdmins("shipment.updated", payload);
      if (args.eventType === "SHIPMENT_DELIVERED") {
        emitToAdmins("shipment.delivered", payload);
      } else if (args.eventType === "SHIPMENT_RTO_INITIATED") {
        emitToAdmins("shipment.rto", payload);
      }
    }

    if (args.eventType.startsWith("RETURN_")) {
      emitToAdmins("return.updated", payload);
    }

    if (args.eventType.startsWith("REFUND_")) {
      emitToAdmins("refund.updated", payload);
    }
  } catch (err) {
    logger.error({ err }, "Error recording order history event");
  }
}
