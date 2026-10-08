import type { Request, Response, NextFunction } from "express";
import { Order, ORDER_STATUSES } from "../../models/Order.js";
import { AppError } from "../../utils/AppError.js";
import { mergeOrderListFilter } from "../../utils/orderListVisibility.js";

export async function listOrdersAdmin(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.max(1, Math.min(50, Number(req.query.limit) || 20));
    const skip = (page - 1) * limit;

    let statusFilter: string | undefined;
    if (
      req.query.status &&
      ORDER_STATUSES.includes(req.query.status as (typeof ORDER_STATUSES)[number])
    ) {
      statusFilter = req.query.status as string;
    }
    const filter = mergeOrderListFilter(statusFilter ?? null);

    const [items, total] = await Promise.all([
      Order.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate("customer", "name email phone")
        .populate("payment", "status amount razorpayOrderId razorpayPaymentId method"),
      Order.countDocuments(filter),
    ]);

    res.json({
      items,
      total,
      page,
      pages: Math.ceil(total / limit),
    });
  } catch (e) {
    next(e);
  }
}

export async function getOrderAdmin(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { id } = req.params;
    const order = await Order.findById(id)
      .populate("customer", "name email phone addresses")
      .populate("payment")
      .lean();
    if (!order) throw new AppError(404, "Order not found");
    res.json(order);
  } catch (e) {
    next(e);
  }
}

export async function putOrderAdminStatus(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { id } = req.params;
    const { status } = req.body as { status?: string };
    const allowed = ["paid", "processing", "shipped", "delivered", "cancelled"] as const;
    if (!status || !allowed.includes(status as (typeof allowed)[number])) {
      throw new AppError(400, `Invalid status. Use one of: ${allowed.join(", ")}`);
    }

    const current = await Order.findById(id);
    if (!current) throw new AppError(404, "Order not found");

    const terminal = ["cancelled", "failed"];
    if (terminal.includes(current.status as string)) {
      throw new AppError(400, "Cannot change status of cancelled or failed orders");
    }

    if (current.status === "pending_payment") {
      if (status !== "cancelled") {
        throw new AppError(
          400,
          "Unpaid orders can only be cancelled. Wait for payment to update fulfillment status."
        );
      }
    } else if (!["paid", "processing", "shipped", "delivered"].includes(current.status as string)) {
      throw new AppError(400, "This order cannot be updated from admin");
    }

    const previousStatus = current.status;
    const previousOrderStatus = current.orderStatus;

    current.set("status", status);
    if (status === "delivered") {
      current.set("orderStatus", "DELIVERED");
      current.set("shippingStatus", "DELIVERED");
      if (!current.shippingInfo) current.shippingInfo = {} as any;
      current.shippingInfo.status = "DELIVERED";
      if (!current.shippingInfo.deliveredAt) {
        current.shippingInfo.deliveredAt = new Date();
      }
      if (current.shiprocket) {
        current.shiprocket.lastStatus = "DELIVERED";
        current.shiprocket.syncedAt = new Date();
      }
      if (current.paymentMethod === "COD" && current.paymentStatus !== "COD_COLLECTED") {
        current.set("paymentStatus", "COD_COLLECTED");
        if (current.paymentInfo) {
          current.paymentInfo.status = "COD_COLLECTED";
          current.paymentInfo.codCollectedAt = new Date();
        }
      }
    } else if (status === "shipped") {
      current.set("orderStatus", "SHIPPED");
      if (!current.shippingStatus || current.shippingStatus === "NOT_CREATED") {
        current.set("shippingStatus", "SHIPPED");
      }
      if (!current.shippingInfo) current.shippingInfo = {} as any;
      if (!current.shippingInfo.shippedAt) {
        current.shippingInfo.shippedAt = new Date();
      }
    } else if (status === "processing") {
      current.set("orderStatus", "PROCESSING");
    } else if (status === "paid") {
      current.set("orderStatus", "CONFIRMED");
    } else if (status === "cancelled") {
      current.set("orderStatus", "CANCELLED");
      current.set("shippingStatus", "CANCELLED");
    }

    await current.save();

    const { recordOrderEvent } = await import("./order.service.js");
    await recordOrderEvent({
      orderId: current._id,
      eventType: status === "delivered" ? "ORDER_DELIVERED" : "ORDER_STATUS_CHANGED",
      previousStatus: previousOrderStatus || previousStatus,
      newStatus: current.orderStatus || status,
      source: "ADMIN",
      metadata: { adminStatusUpdate: status },
    });

    if (status === "cancelled") {
      const { releaseInventoryReservations } = await import("../inventory/inventory.service.js");
      await releaseInventoryReservations(current._id, "ADMIN_RELEASE", "ADMIN");
    }

    const updated = await Order.findById(current._id)
      .populate("customer", "name email phone")
      .populate("payment", "status amount razorpayOrderId razorpayPaymentId method");

    res.json(updated);
  } catch (e) {
    next(e);
  }
}

import { OrderHistory } from "./order-history.model.js";

export async function getOrderHistory(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { id } = req.params;
    const history = await OrderHistory.find({ orderId: id }).sort({ createdAt: -1 });
    res.json({ items: history });
  } catch (e) {
    next(e);
  }
}
