import mongoose from "mongoose";
import { Return } from "./model.js";
import { Order } from "../order/model.js";
import { Payment } from "../payment/model.js";
import { AppError } from "../../utils/AppError.js";
import { recordOrderEvent } from "../order/order.service.js";
import * as shiprocketClient from "../shipping/shiprocket.client.js";
import { restockReturnedItems, recordDamagedReturn } from "../inventory/inventory.service.js";
import * as refundService from "../refund/refund.service.js";
import { logger } from "../../config/logger.js";

function todayReturnPrefix(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}${m}${day}`;
}

export async function generateReturnNumber(): Promise<string> {
  const datePart = todayReturnPrefix();
  const prefix = `RET-${datePart}-`;
  const count = await Return.countDocuments({
    returnNumber: new RegExp(`^${prefix.replace(/-/g, "\\-")}`),
  });
  const seq = String(count + 1).padStart(3, "0");
  return `${prefix}${seq}`;
}

/**
 * Customer initiates a return request.
 */
export async function createReturnRequest(args: {
  customerId: string;
  orderId: string;
  items: { product: string; quantity: number }[];
  reason: "DONT_LIKE" | "DAMAGED" | "WRONG_PRODUCT" | "QUALITY_ISSUE" | "SIZE_ISSUE" | "OTHER";
  description?: string;
}): Promise<any> {
  const isObjectId = mongoose.Types.ObjectId.isValid(args.orderId);
  const order = await Order.findOne(
    isObjectId
      ? { $or: [{ _id: args.orderId }, { orderNumber: args.orderId }] }
      : { orderNumber: args.orderId }
  );
  if (!order) throw new AppError(404, "Order not found");

  if (order.customer.toString() !== args.customerId) {
    throw new AppError(403, "You do not own this order");
  }

  if (order.orderStatus !== "DELIVERED") {
    throw new AppError(400, "Only delivered orders are eligible for return");
  }

  // Enforce 15-day return policy
  const diff = Date.now() - new Date(order.updatedAt || order.createdAt).getTime();
  const returnWindowLimit = 15 * 24 * 60 * 60 * 1000; // 15 days
  if (diff > returnWindowLimit) {
    throw new AppError(400, "Return window of 15 days has expired");
  }

  // Prevent duplicate returns
  const activeReturn = await Return.findOne({ orderId: order._id, status: { $ne: "REJECTED" } });
  if (activeReturn) {
    throw new AppError(400, "A return request already exists for this order");
  }

  // Validate items
  const returnItems: any[] = [];
  let refundAmount = 0;

  for (const requested of args.items) {
    const orderItem = order.items.find((it) => it.product.toString() === requested.product);
    if (!orderItem) {
      throw new AppError(400, `Product not found in this order: ${requested.product}`);
    }
    if (requested.quantity > orderItem.quantity) {
      throw new AppError(
        400,
        `Cannot return more quantity than purchased for product: ${orderItem.name}`
      );
    }
    returnItems.push({
      product: orderItem.product,
      name: orderItem.name,
      sku: orderItem.sku,
      quantity: requested.quantity,
      unitPrice: orderItem.unitPrice,
    });
    refundAmount += orderItem.unitPrice * requested.quantity;
  }

  const returnNumber = await generateReturnNumber();

  // Create Return document
  const returnDoc = await Return.create({
    returnNumber,
    orderId: order._id,
    customerId: order.customer,
    items: returnItems,
    reason: args.reason,
    description: args.description,
    status: "REQUESTED",
    refundInformation: {
      refundMethod: order.paymentMethod === "COD" ? "BANK" : "RAZORPAY",
      refundAmount,
      refundStatus: "PENDING",
    },
  });

  // Update order return status
  const previousStatus = order.returnStatus;
  order.returnStatus = "REQUESTED";
  await order.save();

  // Log audit log & Socket.IO updates
  await recordOrderEvent({
    orderId: order._id,
    eventType: "RETURN_REQUESTED",
    previousStatus,
    newStatus: "REQUESTED",
    source: "CUSTOMER",
    metadata: {
      returnId: returnDoc._id.toString(),
      returnNumber,
    },
  });

  return returnDoc;
}

/**
 * Admin approves return request and books a reverse pickup in Shiprocket.
 */
export async function approveReturn(returnId: string, _adminId: string): Promise<any> {
  const returnDoc = await Return.findById(returnId);
  if (!returnDoc) throw new AppError(404, "Return request not found");

  if (returnDoc.status !== "REQUESTED") {
    throw new AppError(400, `Return cannot be approved in its current status: ${returnDoc.status}`);
  }

  const order = await Order.findById(returnDoc.orderId).populate("customer", "email name phone");
  if (!order) throw new AppError(404, "Order not found");

  // Initiate reverse pickup booking with Shiprocket
  const cust = order.customer as any;
  const customerEmail = cust?.email?.trim() || "customer@mairiijewels.com";

  const returnDate = new Date(returnDoc.createdAt).toISOString().slice(0, 10);
  const itemsPayload = returnDoc.items.map((it, idx) => ({
    name: it.name.slice(0, 200),
    sku: it.sku || `ret-${idx + 1}`,
    units: it.quantity,
    selling_price: String(it.unitPrice),
  }));

  // Warehouse address details
  const warehousePayload = {
    shipping_customer_name: "Mairii Jewels Warehouse",
    shipping_address: "123 Warehouse St, Industrial Area",
    shipping_city: "Jaipur",
    shipping_state: "Rajasthan",
    shipping_country: "India",
    shipping_pincode: "302001",
    shipping_phone: "9999999999",
  };

  const reverseAdhocPayload = {
    order_id: returnDoc.returnNumber,
    order_date: returnDate,
    pickup_customer_name: order.shippingAddress.fullName.split(" ")[0] || "Customer",
    pickup_last_name: order.shippingAddress.fullName.split(" ").slice(1).join(" ") || ".",
    pickup_address: order.shippingAddress.line1,
    pickup_city: order.shippingAddress.city,
    pickup_state: order.shippingAddress.state,
    pickup_pincode: order.shippingAddress.pincode.replace(/\s/g, ""),
    pickup_phone: order.shippingAddress.phone.replace(/\D/g, "").slice(0, 15),
    pickup_email: customerEmail,
    ...warehousePayload,
    order_items: itemsPayload,
    payment_method: "Prepaid",
    sub_total: returnDoc.refundInformation?.refundAmount || 0,
    length: 10,
    breadth: 10,
    height: 5,
    weight: 0.35,
  };

  let reverseDetails = {
    reverseShipmentId: "",
    reverseAwb: "",
    reverseCourier: "",
    reverseTrackingUrl: "",
  };

  try {
    logger.info(`Creating Shiprocket Reverse Order for return: ${returnDoc.returnNumber}`);
    const srRes: any = await shiprocketClient.createReturnOrder(reverseAdhocPayload);
    const shipmentId = String(srRes.shipment_id || srRes.payload?.shipment_id || "");
    const awb = String(srRes.awb_code || srRes.payload?.awb_code || "");
    const courier = String(srRes.courier_name || srRes.payload?.courier_name || "Courier");

    if (shipmentId) {
      reverseDetails = {
        reverseShipmentId: shipmentId,
        reverseAwb: awb,
        reverseCourier: courier,
        reverseTrackingUrl: awb ? `https://shiprocket.co/tracking/${awb}` : "",
      };
    }
  } catch (err: any) {
    logger.error(
      { err },
      "Failed booking reverse pickup with Shiprocket. Approving anyway without AWB."
    );
  }

  // Update return document
  returnDoc.status = "APPROVED";
  returnDoc.pickupDetails = reverseDetails as any;
  await returnDoc.save();

  // Update order return status
  const prevReturnStatus = order.returnStatus;
  order.returnStatus = "APPROVED";
  await order.save();

  await recordOrderEvent({
    orderId: order._id,
    eventType: "RETURN_APPROVED",
    previousStatus: prevReturnStatus,
    newStatus: "APPROVED",
    source: "ADMIN",
    metadata: {
      returnId: returnDoc._id.toString(),
      reverseShipmentId: reverseDetails.reverseShipmentId,
    },
  });

  return returnDoc;
}

/**
 * Admin rejects return request.
 */
export async function rejectReturn(returnId: string, _adminId: string): Promise<any> {
  const returnDoc = await Return.findById(returnId);
  if (!returnDoc) throw new AppError(404, "Return request not found");

  if (returnDoc.status !== "REQUESTED") {
    throw new AppError(400, "Only requested returns can be rejected");
  }

  returnDoc.status = "REJECTED";
  await returnDoc.save();

  const order = await Order.findById(returnDoc.orderId);
  if (order) {
    const prevStatus = order.returnStatus;
    order.returnStatus = "REJECTED";
    await order.save();

    await recordOrderEvent({
      orderId: order._id,
      eventType: "RETURN_REJECTED",
      previousStatus: prevStatus,
      newStatus: "REJECTED",
      source: "ADMIN",
      metadata: { returnId },
    });
  }

  return returnDoc;
}

/**
 * Admin marks returned shipment as physically received.
 */
export async function receiveReturn(returnId: string, _adminId: string): Promise<any> {
  const returnDoc = await Return.findById(returnId);
  if (!returnDoc) throw new AppError(404, "Return request not found");

  const allowed = ["APPROVED", "PICKUP_SCHEDULED", "PICKED_UP", "IN_TRANSIT"];
  if (!allowed.includes(returnDoc.status)) {
    throw new AppError(400, `Cannot mark return received from status ${returnDoc.status}`);
  }

  returnDoc.status = "RECEIVED";
  await returnDoc.save();

  const order = await Order.findById(returnDoc.orderId);
  if (order) {
    const prevStatus = order.returnStatus;
    order.returnStatus = "RECEIVED";
    await order.save();

    await recordOrderEvent({
      orderId: order._id,
      eventType: "RETURN_RECEIVED",
      previousStatus: prevStatus,
      newStatus: "RECEIVED",
      source: "ADMIN",
      metadata: { returnId },
    });
  }

  return returnDoc;
}

/**
 * Admin performs inspection of returned items.
 * Executes inventory adjustments (available stock increment vs damaged record) in a transaction.
 */
export async function inspectReturn(
  returnId: string,
  args: {
    condition: "GOOD" | "DAMAGED" | "USED" | "MISSING_PARTS";
    result: "ACCEPTED" | "REJECTED";
    comment?: string;
  },
  adminId: string
): Promise<any> {
  const returnDoc = await Return.findById(returnId);
  if (!returnDoc) throw new AppError(404, "Return request not found");

  if (returnDoc.status !== "RECEIVED" && returnDoc.status !== "QUALITY_CHECK") {
    throw new AppError(400, "Quality check can only be done on RECEIVED returns");
  }

  const order = await Order.findById(returnDoc.orderId);
  if (!order) throw new AppError(404, "Associated order not found");

  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    returnDoc.inspectionResult = {
      condition: args.condition,
      result: args.result,
      comment: args.comment || "",
      inspectedBy: new mongoose.Types.ObjectId(adminId),
      inspectedAt: new Date(),
    };

    const _prevReturnStatus = returnDoc.status;
    const prevOrderReturnStatus = order.returnStatus;

    if (args.result === "ACCEPTED") {
      returnDoc.status = "ACCEPTED";
      order.returnStatus = "ACCEPTED";
      order.orderStatus = "COMPLETED"; // Restocking completes the order lifecycle

      // Adjust inventory ledger
      if (args.condition === "GOOD") {
        await restockReturnedItems(session, returnDoc, adminId);
      } else {
        await recordDamagedReturn(session, returnDoc, adminId);
      }
    } else {
      returnDoc.status = "REJECTED_AFTER_INSPECTION";
      order.returnStatus = "REJECTED_AFTER_INSPECTION";
    }

    await returnDoc.save({ session });
    await order.save({ session });

    await session.commitTransaction();
    session.endSession();

    // Broadcast Socket.IO and history updates
    await recordOrderEvent({
      orderId: order._id,
      eventType:
        args.result === "ACCEPTED" ? "RETURN_ACCEPTED" : "RETURN_REJECTED_AFTER_INSPECTION",
      previousStatus: prevOrderReturnStatus,
      newStatus: order.returnStatus,
      source: "ADMIN",
      metadata: {
        returnId,
        condition: args.condition,
        comment: args.comment,
      },
    });

    return returnDoc;
  } catch (err) {
    await session.abortTransaction();
    session.endSession();
    throw err;
  }
}

/**
 * Admin triggers refund processing for an accepted return.
 */
export async function refundReturn(
  returnId: string,
  args?: {
    refundMethod?: "BANK" | "UPI";
    refundAccountReference?: string;
  },
  _adminId = "ADMIN"
): Promise<any> {
  const returnDoc = await Return.findById(returnId);
  if (!returnDoc) throw new AppError(404, "Return request not found");

  if (returnDoc.status !== "ACCEPTED") {
    throw new AppError(400, "Refund can only be processed for ACCEPTED returns");
  }

  if (returnDoc.refundInformation?.refundStatus === "COMPLETED") {
    throw new AppError(400, "Refund has already been completed");
  }

  const order = await Order.findById(returnDoc.orderId);
  if (!order) throw new AppError(404, "Associated order not found");

  const prevRefundStatus = order.refundStatus;

  // Prepaid Refund Flow
  if (order.paymentMethod === "PREPAID") {
    const payment = await Payment.findById(order.payment);
    const rzPaymentId = order.paymentInfo?.razorpayPaymentId || payment?.razorpayPaymentId;
    if (!rzPaymentId) {
      throw new AppError(400, "No Razorpay payment reference found to initiate refund");
    }

    if (!returnDoc.refundInformation) {
      returnDoc.refundInformation = {} as any;
    }
    const refInfo = returnDoc.refundInformation as any;

    // Call Razorpay API
    const rzRefund = await refundService.processPrepaidRefund({
      razorpayPaymentId: rzPaymentId,
      amount: refInfo.refundAmount,
      returnNumber: returnDoc.returnNumber,
    });

    returnDoc.status = "COMPLETED";
    refInfo.refundStatus = "COMPLETED";
    refInfo.razorpayRefundId = rzRefund.refundId;
    refInfo.processedAt = new Date();
    await returnDoc.save();

    order.refundStatus = "COMPLETED";
    order.returnStatus = "COMPLETED";
    await order.save();

    await recordOrderEvent({
      orderId: order._id,
      eventType: "REFUND_COMPLETED",
      previousStatus: prevRefundStatus,
      newStatus: "COMPLETED",
      source: "ADMIN",
      metadata: {
        returnId,
        razorpayRefundId: rzRefund.refundId,
        amount: refInfo.refundAmount,
      },
    });
  } else {
    // COD Refund Flow
    const method = args?.refundMethod || "BANK";
    const ref = args?.refundAccountReference || "MANUAL_SETTLEMENT";

    if (!returnDoc.refundInformation) {
      returnDoc.refundInformation = {} as any;
    }
    const refInfo = returnDoc.refundInformation as any;

    returnDoc.status = "COMPLETED";
    refInfo.refundMethod = method;
    refInfo.refundAccountReference = ref;
    refInfo.refundStatus = "COMPLETED";
    refInfo.processedAt = new Date();
    await returnDoc.save();

    order.refundStatus = "COMPLETED";
    order.returnStatus = "COMPLETED";
    await order.save();

    await recordOrderEvent({
      orderId: order._id,
      eventType: "REFUND_COMPLETED",
      previousStatus: prevRefundStatus,
      newStatus: "COMPLETED",
      source: "ADMIN",
      metadata: {
        returnId,
        refundMethod: method,
        refundAccountReference: ref,
        amount: refInfo.refundAmount,
      },
    });
  }

  return returnDoc;
}
