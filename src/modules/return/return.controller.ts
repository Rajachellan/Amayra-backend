import type { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import mongoose from "mongoose";
import { jwtConfig } from "../../config/jwt.js";
import { AppError } from "../../utils/AppError.js";
import * as returnService from "./return.service.js";
import * as reasonService from "./reason.service.js";
import { calculateOrderItemsEligibility } from "./eligibility.service.js";
import { Return } from "./model.js";
import { Order } from "../order/model.js";
import { ReturnRequestEvidence } from "./evidence.model.js";
import { ReturnStatusHistory } from "./history.model.js";
import { StoreCredit } from "../credit/model.js";
import { ExchangeVoucher } from "../voucher/model.js";

/**
 * Get active return and exchange reasons.
 */
export async function getReasons(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const type = req.query.type as "RETURN" | "EXCHANGE" | undefined;
    const reasons = await reasonService.getActiveReasons(type);
    res.json({ items: reasons });
  } catch (e) {
    next(e);
  }
}

/**
 * Customer fetches delivered orders eligible for return or exchange.
 */
export async function getEligibleOrders(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const customerId = (req as any).customerId;
    if (!customerId) throw new AppError(401, "Unauthorized");

    const orders = await Order.find({
      customer: customerId,
      $or: [{ orderStatus: "DELIVERED" }, { status: "delivered" }],
    }).sort({ createdAt: -1 });

    const eligibleOrders = [];
    for (const order of orders) {
      const itemEligibilities = await calculateOrderItemsEligibility(order);
      const hasEligibleItems = itemEligibilities.some(
        (e) => e.returnEligible || e.exchangeEligible
      );
      if (hasEligibleItems) {
        eligibleOrders.push({
          _id: order._id,
          orderNumber: order.orderNumber,
          total: order.total,
          deliveredAt: order.shippingInfo?.deliveredAt || order.updatedAt,
          items: itemEligibilities,
        });
      }
    }

    res.json({ items: eligibleOrders });
  } catch (e) {
    next(e);
  }
}

/**
 * Customer fetches item eligibility for a specific order.
 */
export async function getItemEligibility(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const customerId = (req as any).customerId;
    const { orderId } = req.params;
    if (!customerId) throw new AppError(401, "Unauthorized");

    const order = await Order.findOne({
      $or: [{ _id: orderId }, { orderNumber: orderId }],
      customer: customerId,
    });
    if (!order) throw new AppError(404, "Order not found");

    const eligibilities = await calculateOrderItemsEligibility(order);
    res.json({ orderNumber: order.orderNumber, items: eligibilities });
  } catch (e) {
    next(e);
  }
}

function normalizeDigits(str?: string | null): string {
  if (!str) return "";
  return str.replace(/\D/g, "");
}

function verifyPhoneMatch(input: string, candidate?: string | null): boolean {
  if (!candidate) return false;
  const d1 = normalizeDigits(input);
  const d2 = normalizeDigits(candidate);
  if (!d1 || !d2) return false;
  if (d1 === d2) return true;
  // If either has 10+ digits, compare the last 10 digits (national Indian mobile number)
  if (d1.length >= 10 && d2.length >= 10) {
    return d1.slice(-10) === d2.slice(-10);
  }
  return false;
}

function verifyEmailMatch(input: string, candidate?: string | null): boolean {
  if (!candidate) return false;
  return input.trim().toLowerCase() === candidate.trim().toLowerCase();
}

/**
 * Public portal: Verify order by Order Number and Email OR Phone.
 * If matched, returns order details, items eligibility, return reasons, and a signed 1-hour verification token.
 */
export async function lookupOrderForReturn(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { orderNumber, identifier } = req.body as {
      orderNumber?: string;
      identifier?: string;
    };

    if (!orderNumber || !String(orderNumber).trim()) {
      throw new AppError(400, "Please provide your Order Number.");
    }
    if (!identifier || !String(identifier).trim()) {
      throw new AppError(400, "Please provide your Email Address or Phone Number.");
    }

    const cleanOrderNumber = String(orderNumber).trim().replace(/^#/, "");
    const cleanIdentifier = String(identifier).trim();

    const isObjectId = mongoose.Types.ObjectId.isValid(cleanOrderNumber);
    const escaped = cleanOrderNumber.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

    const order = await Order.findOne(
      isObjectId
        ? {
            $or: [{ _id: cleanOrderNumber }, { orderNumber: new RegExp(`^${escaped}$`, "i") }],
          }
        : { orderNumber: new RegExp(`^${escaped}$`, "i") }
    ).populate("customer", "name email phone");

    if (!order) {
      throw new AppError(
        404,
        "No order found with the provided Order Number. Please check your order confirmation details."
      );
    }

    const customer = order.customer as any;
    const shipping = (order.shippingAddress as any) || {};

    let isMatch = false;

    // 1. Check email match
    if (
      verifyEmailMatch(cleanIdentifier, customer?.email) ||
      verifyEmailMatch(cleanIdentifier, shipping?.email)
    ) {
      isMatch = true;
    }

    // 2. Check phone match
    if (
      !isMatch &&
      (verifyPhoneMatch(cleanIdentifier, customer?.phone) ||
        verifyPhoneMatch(cleanIdentifier, shipping?.phone))
    ) {
      isMatch = true;
    }

    if (!isMatch) {
      throw new AppError(
        403,
        `The email or phone number does not match the records for order ${order.orderNumber}. Please check your details and try again.`
      );
    }

    const customerId = customer?._id?.toString() || order.customer?.toString();

    const verificationToken = jwt.sign(
      {
        orderId: order._id.toString(),
        orderNumber: order.orderNumber,
        customerId,
        purpose: "return_exchange",
      },
      jwtConfig.secret,
      { expiresIn: "1h" }
    );

    const eligibilities = await calculateOrderItemsEligibility(order);
    const reasons = await reasonService.getActiveReasons();

    const orderStatus = order.orderStatus || order.status;
    const isDelivered =
      order.orderStatus === "DELIVERED" || (order.status as string) === "delivered";

    res.json({
      verified: true,
      verificationToken,
      order: {
        _id: order._id,
        orderNumber: order.orderNumber,
        orderStatus,
        status: order.status,
        isDelivered,
        deliveredAt: order.shippingInfo?.deliveredAt || order.updatedAt,
        items: eligibilities,
        shippingAddress: order.shippingAddress,
        total: order.total,
        currency: order.currency || "INR",
      },
      reasons,
    });
  } catch (e) {
    next(e);
  }
}

/**
 * Customer creates a return or exchange request.
 * Supports both logged-in sessions and verified portal sessions via verificationToken.
 */
export async function postCreateReturnRequest(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    let customerId = (req as any).customerId;

    const {
      orderId,
      items,
      reason,
      reasonTitle,
      description,
      requestType,
      exchangeDetails,
      bankDetails,
      evidenceFiles,
      verificationToken,
    } = req.body as {
      orderId?: string;
      items?: { product: string; quantity: number; size?: string }[];
      reason?: string;
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
      verificationToken?: string;
    };

    if (!orderId || !items?.length || !reason) {
      throw new AppError(400, "orderId, items, and reason are required");
    }

    if (!customerId && verificationToken) {
      try {
        const decoded = jwt.verify(verificationToken, jwtConfig.secret) as any;
        if (decoded?.purpose !== "return_exchange") {
          throw new AppError(401, "Invalid return verification session");
        }
        if (decoded.orderId !== String(orderId) && decoded.orderNumber !== String(orderId)) {
          throw new AppError(403, "Verification token does not match target order");
        }
        customerId = decoded.customerId;
      } catch (err: any) {
        if (err instanceof AppError) throw err;
        throw new AppError(401, "Verification session expired. Please find your order again.");
      }
    }

    if (!customerId) {
      throw new AppError(
        401,
        "Unauthorized: Please verify your order or log in to submit a return request"
      );
    }

    const returnDoc = await returnService.createReturnRequest({
      customerId,
      orderId,
      items,
      reason,
      reasonTitle,
      description,
      requestType,
      exchangeDetails,
      bankDetails,
      evidenceFiles,
    });

    res.status(201).json(returnDoc);
  } catch (e) {
    next(e);
  }
}

/**
 * List returns. Admin sees all, customer sees only their own.
 */
export async function getReturnList(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const adminId = (req as any).adminId;
    const customerId = (req as any).customerId;

    const filter: Record<string, any> = {};
    if (!adminId) {
      if (!customerId) throw new AppError(401, "Unauthorized");
      filter.customerId = customerId;
    }

    const items = await Return.find(filter)
      .sort({ createdAt: -1 })
      .populate("orderId", "orderNumber total shippingAddress")
      .populate("customerId", "name email phone");

    res.json({ items });
  } catch (e) {
    next(e);
  }
}

/**
 * Get return details by ID including evidence files & status audit history.
 */
export async function getReturnById(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { id } = req.params;
    const adminId = (req as any).adminId;
    const customerId = (req as any).customerId;

    const returnDoc = await Return.findById(id)
      .populate("orderId")
      .populate("customerId", "name email phone");
    if (!returnDoc) throw new AppError(404, "Return request not found");

    if (!adminId && returnDoc.customerId.toString() !== customerId) {
      throw new AppError(403, "You do not own this return record");
    }

    const evidenceFiles = await ReturnRequestEvidence.find({ returnRequestId: returnDoc._id });
    const history = await ReturnStatusHistory.find({ returnRequestId: returnDoc._id }).sort({
      createdAt: 1,
    });

    res.json({
      ...returnDoc.toObject(),
      evidenceFiles,
      history,
    });
  } catch (e) {
    next(e);
  }
}

/**
 * Admin approves return request.
 */
export async function postApproveReturn(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const adminId = (req as any).adminId;
    if (!adminId) throw new AppError(401, "Unauthorized");

    const id = req.params.id as string;
    const returnDoc = await returnService.approveReturn(id, adminId);
    res.json(returnDoc);
  } catch (e) {
    next(e);
  }
}

/**
 * Admin rejects return request.
 */
export async function postRejectReturn(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const adminId = (req as any).adminId;
    if (!adminId) throw new AppError(401, "Unauthorized");

    const id = req.params.id as string;
    const { rejectionReason, rejectionNotes, comment } = req.body as {
      rejectionReason?: string;
      rejectionNotes?: string;
      comment?: string;
    };

    const reasonText = rejectionReason || comment;
    if (!reasonText) throw new AppError(400, "rejectionReason is required");

    const returnDoc = await returnService.rejectReturn(
      id,
      { rejectionReason: reasonText, rejectionNotes },
      adminId
    );
    res.json(returnDoc);
  } catch (e) {
    next(e);
  }
}

/**
 * Admin reschedules pickup attempt.
 */
export async function postReschedulePickup(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const adminId = (req as any).adminId;
    if (!adminId) throw new AppError(401, "Unauthorized");

    const id = req.params.id as string;
    const { reason } = req.body as { reason?: string };

    const returnDoc = await returnService.reschedulePickup(id, { reason }, adminId);
    res.json(returnDoc);
  } catch (e) {
    next(e);
  }
}

/**
 * Admin marks returned package as physically received at warehouse.
 */
export async function postReceiveReturn(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const adminId = (req as any).adminId;
    if (!adminId) throw new AppError(401, "Unauthorized");

    const id = req.params.id as string;
    const { warehouseNotes } = req.body as { warehouseNotes?: string };

    const returnDoc = await returnService.receiveReturn(id, adminId, { warehouseNotes });
    res.json(returnDoc);
  } catch (e) {
    next(e);
  }
}

/**
 * Admin performs Quality Check (QC).
 */
export async function postInspectReturn(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const adminId = (req as any).adminId;
    if (!adminId) throw new AppError(401, "Unauthorized");

    const id = req.params.id as string;
    const { condition, result, faultSource, qcNotes, comment, qcImages } = req.body as {
      condition?: any;
      result?: any;
      faultSource?: any;
      qcNotes?: string;
      comment?: string;
      qcImages?: string[];
    };

    if (!condition || !result) {
      throw new AppError(400, "condition and result are required");
    }

    const returnDoc = await returnService.qcInspectReturn(
      id,
      { condition, result, faultSource, qcNotes, comment, qcImages },
      adminId
    );
    res.json(returnDoc);
  } catch (e) {
    next(e);
  }
}

/**
 * Admin issues Store Credit or Refund.
 */
export async function postIssueStoreCredit(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const adminId = (req as any).adminId;
    if (!adminId) throw new AppError(401, "Unauthorized");

    const id = req.params.id as string;
    const { expiryDays } = req.body as { expiryDays?: number };

    const result = await returnService.issueStoreCredit(id, { expiryDays }, adminId);
    res.json(result);
  } catch (e) {
    next(e);
  }
}

export const postRefundReturn = postIssueStoreCredit;

/**
 * Admin issues Exchange Voucher.
 */
export async function postIssueExchangeVoucher(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const adminId = (req as any).adminId;
    if (!adminId) throw new AppError(401, "Unauthorized");

    const id = req.params.id as string;
    const { expiryDays } = req.body as { expiryDays?: number };

    const result = await returnService.issueExchangeVoucher(id, { expiryDays }, adminId);
    res.json(result);
  } catch (e) {
    next(e);
  }
}

/**
 * Admin creates Replacement Order.
 */
export async function postCreateReplacementOrder(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const adminId = (req as any).adminId;
    if (!adminId) throw new AppError(401, "Unauthorized");

    const id = req.params.id as string;
    const { replacementItem } = req.body as {
      replacementItem?: { productId: string; quantity: number; size?: string };
    };

    if (!replacementItem || !replacementItem.productId || !replacementItem.quantity) {
      throw new AppError(400, "replacementItem with productId and quantity is required");
    }

    const result = await returnService.createReplacementOrder(id, { replacementItem }, adminId);
    res.json(result);
  } catch (e) {
    next(e);
  }
}

/**
 * Customer fetches their active Store Credits and Exchange Vouchers.
 */
export async function getCustomerCredits(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const customerId = (req as any).customerId;
    if (!customerId) throw new AppError(401, "Unauthorized");

    const storeCredits = await StoreCredit.find({ customerId, status: "ACTIVE" }).sort({
      createdAt: -1,
    });
    const exchangeVouchers = await ExchangeVoucher.find({ customerId, status: "ACTIVE" }).sort({
      createdAt: -1,
    });

    res.json({ storeCredits, exchangeVouchers });
  } catch (e) {
    next(e);
  }
}

/**
 * Admin Reasons Management.
 */
export async function getAdminReasons(
  _req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const reasons = await reasonService.getAllReasonsAdmin();
    res.json({ items: reasons });
  } catch (e) {
    next(e);
  }
}

export async function createAdminReason(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { title, code, type, isActive, sortOrder } = req.body;
    if (!title || !code || !type) {
      throw new AppError(400, "title, code, and type are required");
    }
    const reason = await reasonService.createReasonAdmin({
      title,
      code,
      type,
      isActive,
      sortOrder,
    });
    res.status(201).json(reason);
  } catch (e) {
    next(e);
  }
}

export async function updateAdminReason(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { id } = req.params;
    const reasonId = Array.isArray(id) ? id[0] : id;
    const reason = await reasonService.updateReasonAdmin(reasonId, req.body);
    res.json(reason);
  } catch (e) {
    next(e);
  }
}
