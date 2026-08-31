import mongoose from "mongoose";
import { AppError } from "../../utils/AppError.js";
import { logger } from "../../config/logger.js";
import { Order } from "../order/model.js";
import { Product } from "../product/model.js";
import { Return } from "./model.js";
import { ReturnRequestEvidence } from "./evidence.model.js";
import { ReturnStatusHistory } from "./history.model.js";
import { transitionReturnStatus } from "./statemachine.service.js";
import { calculateOrderItemsEligibility } from "./eligibility.service.js";
import { StoreCredit } from "../credit/model.js";
import { ExchangeVoucher } from "../voucher/model.js";
import * as shiprocketClient from "../../integrations/shiprocket/service.js";
import { restockReturnedItems, recordDamagedReturn } from "../inventory/inventory.service.js";

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

export async function generateCreditCode(prefix = "SC"): Promise<string> {
  const rand = Math.random().toString(36).substring(2, 7).toUpperCase();
  return `${prefix}-${todayReturnPrefix()}-${rand}`;
}

/**
 * Customer initiates a return or exchange request.
 */
export async function createReturnRequest(args: {
  customerId: string;
  orderId: string;
  items: { product: string; quantity: number; size?: string }[];
  reason: string;
  reasonTitle?: string;
  description?: string;
  requestType?: "RETURN" | "EXCHANGE";
  exchangeDetails?: { requestedVariant?: string; preferredSize?: string; notes?: string };
  bankDetails?: {
    accountHolderName?: string;
    accountNumber?: string;
    ifscCode?: string;
    bankName?: string;
    upiId?: string;
  };
  evidenceFiles?: { fileUrl: string; fileType: "IMAGE" | "VIDEO"; mimeType?: string }[];
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

  // Calculate eligibility
  const eligibility = await calculateOrderItemsEligibility(order);

  const returnItems: any[] = [];
  let calculatedSettlementAmount = 0;

  for (const reqItem of args.items) {
    const itemEligibility = eligibility.find((e) => e.productId === reqItem.product);
    if (!itemEligibility) {
      throw new AppError(400, `Product not found in this order: ${reqItem.product}`);
    }

    if (!itemEligibility.futureReversePickupAllowed) {
      throw new AppError(
        400,
        `Item '${itemEligibility.name}' is permanently blocked from returns/exchanges`
      );
    }

    const reqType = args.requestType || "RETURN";
    if (reqType === "RETURN" && !itemEligibility.returnEligible) {
      throw new AppError(
        400,
        itemEligibility.reason ||
          `Item '${itemEligibility.name}' is not eligible for return (24-hour limit from delivery)`
      );
    }
    if (reqType === "EXCHANGE" && !itemEligibility.exchangeEligible) {
      throw new AppError(
        400,
        itemEligibility.reason ||
          `Item '${itemEligibility.name}' is not eligible for exchange (5-day limit from delivery)`
      );
    }

    if (reqItem.quantity > itemEligibility.remainingEligibleQuantity) {
      throw new AppError(
        400,
        `Requested quantity (${reqItem.quantity}) exceeds remaining eligible quantity (${itemEligibility.remainingEligibleQuantity}) for item: ${itemEligibility.name}`
      );
    }

    const orderItem = order.items.find((it) => it.product.toString() === reqItem.product);
    const unitPrice = orderItem ? orderItem.unitPrice : 0;

    returnItems.push({
      product: reqItem.product,
      name: itemEligibility.name,
      sku: itemEligibility.sku,
      size: reqItem.size || (orderItem as any)?.size,
      quantity: reqItem.quantity,
      unitPrice,
    });

    calculatedSettlementAmount += unitPrice * reqItem.quantity;
  }

  const returnNumber = await generateReturnNumber();

  // Create Return Document
  const returnDoc = await Return.create({
    returnNumber,
    orderId: order._id,
    customerId: order.customer,
    requestType: args.requestType || "RETURN",
    items: returnItems,
    reason: args.reason,
    reasonTitle: args.reasonTitle || args.reason,
    description: args.description,
    exchangeDetails: args.exchangeDetails || null,
    bankDetails: args.bankDetails || null,
    status: "REQUESTED",
    settlementDetails: {
      settlementAmount: calculatedSettlementAmount,
      refundMethod: order.paymentMethod === "COD" ? "BANK" : "RAZORPAY",
    },
  });

  // Lock quantity on order items
  for (const reqItem of args.items) {
    const orderItem = order.items.find((it) => it.product.toString() === reqItem.product);
    if (orderItem) {
      (orderItem as any).lockedQuantity =
        ((orderItem as any).lockedQuantity || 0) + reqItem.quantity;
    }
  }

  order.returnStatus = "REQUESTED";
  await order.save();

  // Save Evidence Files
  if (args.evidenceFiles && args.evidenceFiles.length > 0) {
    const evidenceDocs = args.evidenceFiles.map((f) => ({
      returnRequestId: returnDoc._id,
      fileUrl: f.fileUrl,
      fileType: f.fileType,
      mimeType: f.mimeType,
      uploadedBy: "CUSTOMER",
    }));
    await ReturnRequestEvidence.insertMany(evidenceDocs);
  }

  // Write History Audit Log
  await ReturnStatusHistory.create({
    returnRequestId: returnDoc._id,
    previousStatus: "NONE",
    newStatus: "REQUESTED",
    changedBy: order.customer,
    changedByRole: "CUSTOMER",
    notes: `Customer requested ${args.requestType || "RETURN"} for order ${order.orderNumber}`,
    metadata: { items: returnItems, reason: args.reason },
  });

  return returnDoc;
}

/**
 * Admin approves return request and books reverse pickup in Shiprocket.
 */
export async function approveReturn(returnId: string, adminId: string): Promise<any> {
  const returnDoc = await Return.findById(returnId);
  if (!returnDoc) throw new AppError(404, "Return request not found");

  if (returnDoc.status !== "REQUESTED" && returnDoc.status !== "UNDER_REVIEW") {
    throw new AppError(400, `Cannot approve return request in current status: ${returnDoc.status}`);
  }

  const order = await Order.findById(returnDoc.orderId).populate("customer", "email name phone");
  if (!order) throw new AppError(404, "Associated order not found");

  const cust = order.customer as any;
  const customerEmail = cust?.email?.trim() || "customer@mairiijewels.com";
  const returnDate = new Date(returnDoc.createdAt).toISOString().slice(0, 10);

  const itemsPayload = returnDoc.items.map((it, idx) => ({
    name: it.name.slice(0, 200),
    sku: it.sku || `ret-${idx + 1}`,
    units: it.quantity,
    selling_price: String(it.unitPrice),
  }));

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
    sub_total: returnDoc.settlementDetails?.settlementAmount || 0,
    length: 10,
    breadth: 10,
    height: 5,
    weight: 0.35,
  };

  let reverseDetails: any = {
    courierProvider: "SHIPROCKET",
    reverseShipmentId: "",
    reverseAwb: "",
    reverseCourier: "",
    reverseTrackingUrl: "",
    pickupAttemptCount: 1,
    maxPickupAttempts: 3,
    rescheduleAllowed: true,
    attemptHistory: [
      {
        attemptNumber: 1,
        date: new Date(),
        reason: "Pickup initiated upon approval",
        status: "SCHEDULED",
      },
    ],
  };

  try {
    logger.info(`Creating Shiprocket Reverse Order for return: ${returnDoc.returnNumber}`);
    const srRes: any = await shiprocketClient.createReturnOrder(reverseAdhocPayload);
    const shipmentId = String(srRes.shipment_id || srRes.payload?.shipment_id || "");
    const awb = String(srRes.awb_code || srRes.payload?.awb_code || "");
    const courier = String(
      srRes.courier_name || srRes.payload?.courier_name || "Shiprocket Courier"
    );

    reverseDetails.reverseShipmentId = shipmentId;
    reverseDetails.reverseAwb = awb;
    reverseDetails.reverseCourier = courier;
    reverseDetails.reverseTrackingUrl = awb ? `https://shiprocket.co/tracking/${awb}` : "";
    reverseDetails.courierStatus = "PICKUP_SCHEDULED";
  } catch (err: any) {
    logger.error(
      { err },
      "Failed booking reverse pickup with Shiprocket. Approving request anyway."
    );
  }

  returnDoc.pickupDetails = reverseDetails;
  await returnDoc.save();

  await transitionReturnStatus({
    returnId: returnDoc._id,
    targetStatus: "APPROVED",
    changedBy: adminId,
    changedByRole: "ADMIN",
    notes: "Admin approved return request",
  });

  await transitionReturnStatus({
    returnId: returnDoc._id,
    targetStatus: "PICKUP_SCHEDULED",
    changedBy: adminId,
    changedByRole: "ADMIN",
    notes: "Reverse pickup scheduled with courier",
  });

  order.returnStatus = "PICKUP_SCHEDULED";
  await order.save();

  return Return.findById(returnDoc._id);
}

/**
 * Admin rejects a return request.
 */
export async function rejectReturn(
  returnId: string,
  args: { rejectionReason: string; rejectionNotes?: string } | string,
  adminId: string
): Promise<any> {
  const returnDoc = await Return.findById(returnId);
  if (!returnDoc) throw new AppError(404, "Return request not found");

  const rejectionReason = typeof args === "string" ? args : args.rejectionReason;
  const rejectionNotes = typeof args === "string" ? "" : args.rejectionNotes || "";

  if (!rejectionReason) {
    throw new AppError(400, "Rejection reason is required");
  }

  const order = await Order.findById(returnDoc.orderId);
  if (!order) throw new AppError(404, "Associated order not found");

  // Release locked quantity on order items
  for (const item of returnDoc.items) {
    const orderItem = order.items.find((it) => it.product.toString() === item.product.toString());
    if (orderItem) {
      (orderItem as any).lockedQuantity = Math.max(
        0,
        ((orderItem as any).lockedQuantity || 0) - item.quantity
      );
    }
  }

  returnDoc.rejectionDetails = {
    rejectionReason,
    rejectionNotes,
    rejectedBy: mongoose.Types.ObjectId.isValid(adminId)
      ? new mongoose.Types.ObjectId(adminId)
      : undefined,
    rejectedAt: new Date(),
  };

  await returnDoc.save();

  await transitionReturnStatus({
    returnId: returnDoc._id,
    targetStatus: "REJECTED",
    changedBy: adminId,
    changedByRole: "ADMIN",
    notes: `Return rejected by admin: ${rejectionReason}`,
  });

  await transitionReturnStatus({
    returnId: returnDoc._id,
    targetStatus: "CLOSED",
    changedBy: adminId,
    changedByRole: "ADMIN",
    notes: "Case closed after rejection",
  });

  order.returnStatus = "REJECTED";
  await order.save();

  return returnDoc;
}

/**
 * Reschedule pickup or handle pickup failure up to 3 attempts.
 */
export async function reschedulePickup(
  returnId: string,
  args: { reason?: string },
  adminId: string
): Promise<any> {
  const returnDoc = await Return.findById(returnId);
  if (!returnDoc) throw new AppError(404, "Return request not found");

  const pickup = returnDoc.pickupDetails || ({} as any);
  const currentAttempts = pickup.pickupAttemptCount || 0;
  const maxAttempts = pickup.maxPickupAttempts || 3;

  if (currentAttempts >= maxAttempts) {
    pickup.rescheduleAllowed = false;
    pickup.pickupAttemptCount = currentAttempts;
    pickup.attemptHistory.push({
      attemptNumber: currentAttempts,
      date: new Date(),
      reason: args.reason || "Maximum pickup attempt limit (3) reached",
      status: "FAILED_FINAL",
    });
    returnDoc.pickupDetails = pickup;
    await returnDoc.save();

    const order = await Order.findById(returnDoc.orderId);
    if (order) {
      for (const item of returnDoc.items) {
        const orderItem = order.items.find(
          (it) => it.product.toString() === item.product.toString()
        );
        if (orderItem) {
          (orderItem as any).lockedQuantity = Math.max(
            0,
            ((orderItem as any).lockedQuantity || 0) - item.quantity
          );
        }
      }
      order.returnStatus = "PICKUP_FAILED";
      await order.save();
    }

    await transitionReturnStatus({
      returnId: returnDoc._id,
      targetStatus: "PICKUP_FAILED",
      changedBy: adminId,
      changedByRole: "ADMIN",
      notes: "Pickup failed 3 times. Maximum attempts reached.",
    });

    await transitionReturnStatus({
      returnId: returnDoc._id,
      targetStatus: "CLOSED",
      changedBy: adminId,
      changedByRole: "ADMIN",
      notes: "Case closed automatically after 3 failed pickup attempts.",
    });

    throw new AppError(400, "Maximum 3 pickup attempts reached. Request has been closed.");
  }

  const newAttemptCount = currentAttempts + 1;
  pickup.pickupAttemptCount = newAttemptCount;
  pickup.rescheduleAllowed = newAttemptCount < maxAttempts;
  pickup.attemptHistory.push({
    attemptNumber: newAttemptCount,
    date: new Date(),
    reason: args.reason || "Pickup rescheduled by admin",
    status: "RESCHEDULED",
  });

  returnDoc.pickupDetails = pickup;
  await returnDoc.save();

  await transitionReturnStatus({
    returnId: returnDoc._id,
    targetStatus: "PICKUP_SCHEDULED",
    changedBy: adminId,
    changedByRole: "ADMIN",
    notes: `Pickup rescheduled (Attempt ${newAttemptCount} of ${maxAttempts})`,
  });

  return returnDoc;
}

/**
 * Admin marks returned shipment as physically received at warehouse.
 */
export async function receiveReturn(
  returnId: string,
  adminId: string,
  args?: { warehouseNotes?: string }
): Promise<any> {
  const returnDoc = await Return.findById(returnId);
  if (!returnDoc) throw new AppError(404, "Return request not found");

  returnDoc.receivingDetails = {
    receivedBy: mongoose.Types.ObjectId.isValid(adminId)
      ? new mongoose.Types.ObjectId(adminId)
      : undefined,
    receivedAt: new Date(),
    warehouseNotes: args?.warehouseNotes || "Physically received at warehouse",
  };
  await returnDoc.save();

  await transitionReturnStatus({
    returnId: returnDoc._id,
    targetStatus: "RECEIVED_AT_WAREHOUSE",
    changedBy: adminId,
    changedByRole: "ADMIN",
    notes: "Package received at warehouse",
  });

  await transitionReturnStatus({
    returnId: returnDoc._id,
    targetStatus: "QC_IN_PROGRESS",
    changedBy: adminId,
    changedByRole: "ADMIN",
    notes: "Quality Check initiated",
  });

  const order = await Order.findById(returnDoc.orderId);
  if (order) {
    order.returnStatus = "RECEIVED_AT_WAREHOUSE";
    await order.save();
  }

  return Return.findById(returnDoc._id);
}

/**
 * Perform Quality Check (QC) on returned items.
 */
export async function qcInspectReturn(
  returnId: string,
  args: {
    condition: "GOOD" | "DAMAGED" | "USED" | "MISSING_PARTS";
    result: "QC_APPROVED" | "QC_REJECTED" | "ACCEPTED" | "REJECTED";
    faultSource?: "OUR_FAULT" | "CUSTOMER_FAULT" | "COURIER_FAULT";
    qcNotes?: string;
    comment?: string;
    qcImages?: string[];
  },
  adminId: string
): Promise<any> {
  const returnDoc = await Return.findById(returnId);
  if (!returnDoc) throw new AppError(404, "Return request not found");

  const order = await Order.findById(returnDoc.orderId);
  if (!order) throw new AppError(404, "Associated order not found");

  const session = await mongoose.startSession();
  session.startTransaction();

  const isApproved = args.result === "QC_APPROVED" || args.result === "ACCEPTED";
  const qcResult = isApproved ? "QC_APPROVED" : "QC_REJECTED";

  try {
    returnDoc.qcDetails = {
      condition: args.condition,
      result: qcResult as any,
      faultSource: args.faultSource || "NONE",
      qcNotes: args.qcNotes || args.comment || "",
      qcImages: args.qcImages || [],
      performedBy: mongoose.Types.ObjectId.isValid(adminId)
        ? new mongoose.Types.ObjectId(adminId)
        : undefined,
      performedAt: new Date(),
    };

    if (isApproved) {
      await transitionReturnStatus({
        returnId: returnDoc._id,
        targetStatus: "QC_APPROVED",
        changedBy: adminId,
        changedByRole: "ADMIN",
        notes: `QC Approved. Condition: ${args.condition}`,
        session,
      });

      await transitionReturnStatus({
        returnId: returnDoc._id,
        targetStatus: "SETTLEMENT_PROCESSING",
        changedBy: adminId,
        changedByRole: "ADMIN",
        notes: "Moved to settlement processing",
        session,
      });

      for (const item of returnDoc.items) {
        const orderItem = order.items.find(
          (it) => it.product.toString() === item.product.toString()
        );
        if (orderItem) {
          (orderItem as any).lockedQuantity = Math.max(
            0,
            ((orderItem as any).lockedQuantity || 0) - item.quantity
          );
          if (returnDoc.requestType === "EXCHANGE") {
            (orderItem as any).exchangedQuantity =
              ((orderItem as any).exchangedQuantity || 0) + item.quantity;
          } else {
            (orderItem as any).returnedQuantity =
              ((orderItem as any).returnedQuantity || 0) + item.quantity;
          }
        }
      }

      if (args.condition === "GOOD") {
        await restockReturnedItems(session, returnDoc, adminId);
      } else if (args.condition === "DAMAGED" || args.condition === "MISSING_PARTS") {
        await recordDamagedReturn(session, returnDoc, adminId);
      }

      order.returnStatus = "QC_APPROVED";
    } else {
      await transitionReturnStatus({
        returnId: returnDoc._id,
        targetStatus: "QC_REJECTED",
        changedBy: adminId,
        changedByRole: "ADMIN",
        notes: `QC Rejected by admin. Condition: ${args.condition}. Product used by customer.`,
        session,
      });

      await transitionReturnStatus({
        returnId: returnDoc._id,
        targetStatus: "CLOSED",
        changedBy: adminId,
        changedByRole: "ADMIN",
        notes: "Request closed after QC rejection. Item shipped back to customer.",
        session,
      });

      returnDoc.futureReversePickupAllowed = false;

      for (const item of returnDoc.items) {
        const orderItem = order.items.find(
          (it) => it.product.toString() === item.product.toString()
        );
        if (orderItem) {
          (orderItem as any).lockedQuantity = Math.max(
            0,
            ((orderItem as any).lockedQuantity || 0) - item.quantity
          );
          (orderItem as any).futureReversePickupAllowed = false;
        }
      }

      order.returnStatus = "QC_REJECTED";
    }

    await returnDoc.save({ session });
    await order.save({ session });

    await session.commitTransaction();
    session.endSession();

    return Return.findById(returnDoc._id);
  } catch (err) {
    await session.abortTransaction();
    session.endSession();
    throw err;
  }
}

// Backward-compatible alias
export const inspectReturn = (returnId: string, args: any, adminId: string) =>
  qcInspectReturn(returnId, args, adminId);

/**
 * Issue Store Credit to Customer with partial balance tracking.
 */
export async function issueStoreCredit(
  returnId: string,
  args: { expiryDays?: number },
  adminId: string
): Promise<any> {
  const returnDoc = await Return.findById(returnId);
  if (!returnDoc) throw new AppError(404, "Return request not found");

  if (returnDoc.status !== "QC_APPROVED" && returnDoc.status !== "SETTLEMENT_PROCESSING") {
    throw new AppError(400, `Store credit cannot be issued in current status: ${returnDoc.status}`);
  }

  const order = await Order.findById(returnDoc.orderId);
  if (!order) throw new AppError(404, "Associated order not found");

  const amount = returnDoc.settlementDetails?.settlementAmount || 0;
  if (amount <= 0) throw new AppError(400, "Settlement amount must be greater than 0");

  const creditCode = await generateCreditCode("SC");
  const expiryDays = args.expiryDays || 365;
  const expiryDate = new Date(Date.now() + expiryDays * 24 * 60 * 60 * 1000);

  const storeCredit = await StoreCredit.create({
    creditCode,
    customerId: returnDoc.customerId,
    originalOrderId: returnDoc.orderId,
    returnRequestId: returnDoc._id,
    originalAmount: amount,
    remainingBalance: amount,
    expiryDate,
    status: "ACTIVE",
  });

  returnDoc.settlementDetails = {
    settlementType: "STORE_CREDIT",
    storeCreditId: storeCredit._id as any,
    settlementAmount: amount,
    refundMethod: order.paymentMethod === "COD" ? "BANK" : "RAZORPAY",
    processedAt: new Date(),
  };

  await returnDoc.save();

  await transitionReturnStatus({
    returnId: returnDoc._id,
    targetStatus: "REFUND_ISSUED",
    changedBy: adminId,
    changedByRole: "ADMIN",
    notes: `Issued Store Credit ${creditCode} of ₹${amount}`,
  });

  await transitionReturnStatus({
    returnId: returnDoc._id,
    targetStatus: "COMPLETED",
    changedBy: adminId,
    changedByRole: "ADMIN",
    notes: "Return process completed successfully via Store Credit",
  });

  order.returnStatus = "COMPLETED";
  order.refundStatus = "COMPLETED";
  await order.save();

  return { returnDoc: await Return.findById(returnDoc._id), storeCredit };
}

// Backward-compatible alias for refundReturn
export const refundReturn = (returnId: string, args: any, adminId: string) =>
  issueStoreCredit(returnId, args, adminId);

/**
 * Issue Exchange Voucher (1 month validity) when replacement item is unavailable.
 */
export async function issueExchangeVoucher(
  returnId: string,
  args: { expiryDays?: number },
  adminId: string
): Promise<any> {
  const returnDoc = await Return.findById(returnId);
  if (!returnDoc) throw new AppError(404, "Return request not found");

  if (returnDoc.status !== "QC_APPROVED" && returnDoc.status !== "SETTLEMENT_PROCESSING") {
    throw new AppError(
      400,
      `Exchange voucher cannot be issued in current status: ${returnDoc.status}`
    );
  }

  const order = await Order.findById(returnDoc.orderId);
  if (!order) throw new AppError(404, "Associated order not found");

  const amount = returnDoc.settlementDetails?.settlementAmount || 0;
  const voucherCode = await generateCreditCode("EXV");
  const expiryDays = args.expiryDays || 30;
  const expiryDate = new Date(Date.now() + expiryDays * 24 * 60 * 60 * 1000);

  const voucher = await ExchangeVoucher.create({
    voucherCode,
    customerId: returnDoc.customerId,
    originalOrderId: returnDoc.orderId,
    returnRequestId: returnDoc._id,
    amount,
    remainingBalance: amount,
    expiryDate,
    status: "ACTIVE",
  });

  returnDoc.settlementDetails = {
    settlementType: "EXCHANGE_VOUCHER",
    exchangeVoucherId: voucher._id as any,
    settlementAmount: amount,
    refundMethod: order.paymentMethod === "COD" ? "BANK" : "RAZORPAY",
    processedAt: new Date(),
  };

  await returnDoc.save();

  await transitionReturnStatus({
    returnId: returnDoc._id,
    targetStatus: "VOUCHER_ISSUED",
    changedBy: adminId,
    changedByRole: "ADMIN",
    notes: `Issued Exchange Voucher ${voucherCode} of ₹${amount}`,
  });

  await transitionReturnStatus({
    returnId: returnDoc._id,
    targetStatus: "COMPLETED",
    changedBy: adminId,
    changedByRole: "ADMIN",
    notes: "Exchange process completed via Exchange Voucher",
  });

  order.returnStatus = "COMPLETED";
  await order.save();

  return { returnDoc: await Return.findById(returnDoc._id), voucher };
}

/**
 * Create a separate Replacement Order (e.g. EX-ORD-1001-01) for approved exchange.
 */
export async function createReplacementOrder(
  returnId: string,
  args: { replacementItem: { productId: string; quantity: number; size?: string } },
  adminId: string
): Promise<any> {
  const returnDoc = await Return.findById(returnId);
  if (!returnDoc) throw new AppError(404, "Return request not found");

  if (returnDoc.status !== "QC_APPROVED" && returnDoc.status !== "SETTLEMENT_PROCESSING") {
    throw new AppError(
      400,
      `Replacement order cannot be created in current status: ${returnDoc.status}`
    );
  }

  const originalOrder = await Order.findById(returnDoc.orderId);
  if (!originalOrder) throw new AppError(404, "Original order not found");

  const product = await Product.findById(args.replacementItem.productId);
  if (!product) throw new AppError(404, "Replacement product not found");

  const replacementOrderNumber = `EX-${originalOrder.orderNumber}-01`;

  const prodObj = product.toObject() as any;
  const prodName = prodObj.name || prodObj.title || "Replacement Item";
  const unitPrice = prodObj.price || prodObj.pricing?.salePrice || prodObj.pricing?.basePrice || 0;
  const primaryImg =
    (prodObj.images && prodObj.images[0]) || prodObj.media?.primaryImage?.url || "";

  const replacementOrder = await Order.create({
    orderNumber: replacementOrderNumber,
    customer: originalOrder.customer,
    items: [
      {
        product: product._id,
        name: prodName,
        slug: prodObj.slug || "replacement-item",
        sku: prodObj.sku,
        unitPrice,
        quantity: args.replacementItem.quantity,
        lineTotal: unitPrice * args.replacementItem.quantity,
        image: primaryImg,
        size: args.replacementItem.size || returnDoc.exchangeDetails?.preferredSize,
      },
    ],
    shippingAddress: originalOrder.shippingAddress,
    subtotal: 0,
    discount: 0,
    tax: 0,
    shipping: 0,
    total: 0,
    orderStatus: "PROCESSING",
    paymentStatus: "CAPTURED",
    paymentMethod: "PREPAID",
  });

  returnDoc.settlementDetails = {
    settlementType: "EXCHANGE_REPLACEMENT",
    replacementOrderId: replacementOrder._id as any,
    replacementOrderNumber,
    settlementAmount: 0,
    refundMethod: originalOrder.paymentMethod === "COD" ? "BANK" : "RAZORPAY",
    processedAt: new Date(),
  };
  await returnDoc.save();

  await transitionReturnStatus({
    returnId: returnDoc._id,
    targetStatus: "EXCHANGE_PROCESSING",
    changedBy: adminId,
    changedByRole: "ADMIN",
    notes: `Created Replacement Order ${replacementOrderNumber}`,
  });

  await transitionReturnStatus({
    returnId: returnDoc._id,
    targetStatus: "REPLACEMENT_SHIPPED",
    changedBy: adminId,
    changedByRole: "ADMIN",
    notes: "Replacement order created and queued for shipment",
  });

  await transitionReturnStatus({
    returnId: returnDoc._id,
    targetStatus: "COMPLETED",
    changedBy: adminId,
    changedByRole: "ADMIN",
    notes: "Exchange completed with replacement order",
  });

  originalOrder.returnStatus = "COMPLETED";
  await originalOrder.save();

  return { returnDoc: await Return.findById(returnDoc._id), replacementOrder };
}
