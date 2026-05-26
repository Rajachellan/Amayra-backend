import type { Request, Response, NextFunction } from "express";
import mongoose from "mongoose";
import { validatePaymentVerification } from "razorpay/dist/utils/razorpay-utils.js";
import { Order } from "../models/Order.js";
import { Payment } from "../models/Payment.js";
import {
  buildOrderDraft,
  createPendingOrderFromDraft,
  markOrderPaid,
  type CheckoutLineInput,
  type ShippingAddressInput,
} from "../services/checkoutService.js";
import { createRazorpayOrder } from "../services/razorpayService.js";
import { AppError } from "../utils/AppError.js";
import { mergeOrderListFilter, orderIsVisibleToCustomer } from "../utils/orderListVisibility.js";

export async function postCheckout(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const customerId = (req as Request & { customerId?: string }).customerId;
    if (!customerId) throw new AppError(401, "Unauthorized");

    const body = req.body as {
      items?: CheckoutLineInput[];
      shippingAddress?: ShippingAddressInput;
    };
    if (!body.items?.length || !body.shippingAddress)
      throw new AppError(400, "items and shippingAddress required");

    const cid = customerId;

    const draft = await buildOrderDraft(
      new mongoose.Types.ObjectId(cid),
      body.items as CheckoutLineInput[],
      body.shippingAddress as ShippingAddressInput
    );

    const amountPaise = Math.round(draft.total * 100);

    let rzOrder: { id: string };
    try {
      rzOrder = (await createRazorpayOrder(amountPaise, draft.orderNumber, {
        customerId: cid,
      })) as { id: string };
    } catch (e) {
      next(e instanceof Error ? new AppError(502, `Razorpay error: ${e.message}`) : e);
      return;
    }

    const { order, payment } = await createPendingOrderFromDraft({
      customerId: cid,
      draft,
      shippingAddress: body.shippingAddress as ShippingAddressInput,
      razorpayOrderId: rzOrder.id,
    });

    res.status(201).json({
      orderId: order._id,
      orderNumber: order.orderNumber,
      razorpayOrderId: payment.razorpayOrderId,
      amount: amountPaise,
      currency: "INR",
      key: process.env.RAZORPAY_KEY_ID ?? "",
      displayTotal: draft.total,
    });
  } catch (e) {
    next(e);
  }
}

export async function postVerifyPayment(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const customerId = (req as Request & { customerId?: string }).customerId;
    if (!customerId) throw new AppError(401, "Unauthorized");

    const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body as {
      razorpay_order_id?: string;
      razorpay_payment_id?: string;
      razorpay_signature?: string;
    };
    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature)
      throw new AppError(400, "payment response fields missing");

    const secret = process.env.RAZORPAY_KEY_SECRET;
    if (!secret) throw new AppError(500, "RAZORPAY_KEY_SECRET not configured");

    let valid = false;
    try {
      valid = validatePaymentVerification(
        {
          order_id: razorpay_order_id,
          payment_id: razorpay_payment_id,
        },
        razorpay_signature,
        secret
      );
    } catch {
      valid = false;
    }
    if (!valid) throw new AppError(400, "Invalid payment signature");

    const paymentDoc = await Payment.findOne({
      razorpayOrderId: razorpay_order_id,
      customer: new mongoose.Types.ObjectId(customerId),
    });
    if (!paymentDoc?.order) throw new AppError(404, "Payment not found for this account");

    const orderDoc = await Order.findById(paymentDoc.order);
    if (!orderDoc || orderDoc.customer?.toString() !== customerId) {
      throw new AppError(403, "Order does not belong to you");
    }

    await markOrderPaid({
      paymentDocId: paymentDoc._id,
      razorpayPaymentId: razorpay_payment_id,
      razorpaySignature: razorpay_signature,
      appendRaw: { verifiedAt: new Date().toISOString(), source: "client_verify" },
    });

    res.json({
      ok: true,
      orderId: orderDoc._id,
      orderNumber: orderDoc.orderNumber,
    });
  } catch (e) {
    next(e);
  }
}

export async function listMyOrders(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const customerId = (req as Request & { customerId?: string }).customerId;
    if (!customerId) throw new AppError(401, "Unauthorized");
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.max(1, Math.min(50, Number(req.query.limit) || 20));
    const skip = (page - 1) * limit;

    const visibility = mergeOrderListFilter(null);

    const [items, total] = await Promise.all([
      Order.find({ customer: customerId, ...visibility })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      Order.countDocuments({ customer: customerId, ...visibility }),
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

export async function getMyOrder(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const customerId = (req as Request & { customerId?: string }).customerId;
    if (!customerId) throw new AppError(401, "Unauthorized");
    const { id } = req.params;

    const order = await Order.findOne({ _id: id, customer: customerId })
      .populate("payment")
      .lean();

    if (!order) throw new AppError(404, "Order not found");
    if (!orderIsVisibleToCustomer(order))
      throw new AppError(404, "Order not found");
    res.json(order);
  } catch (e) {
    next(e);
  }
}
