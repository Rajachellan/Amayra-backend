import mongoose from "mongoose";
import { Product } from "../models/Product.js";
import { Order } from "../models/Order.js";
import { Payment } from "../models/Payment.js";
import { AppError } from "../utils/AppError.js";

const publishedStatuses = ["published", null] as unknown[];

export type CheckoutLineInput = { slug: string; quantity: number };

export type ShippingAddressInput = {
  fullName: string;
  phone: string;
  line1: string;
  city: string;
  state: string;
  pincode: string;
  country?: string;
};

function normalizeOrderTotal(subtotal: number, taxPercent: number, shipping: number) {
  const tax = Math.round(subtotal * taxPercent * 100) / 100;
  const total = Math.round((subtotal + tax + shipping) * 100) / 100;
  return { tax, total };
}

function todayOrderPrefix(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}${m}${day}`;
}

export async function generateOrderNumber(): Promise<string> {
  const datePart = todayOrderPrefix();
  const prefix = `AMY-${datePart}-`;
  const count = await Order.countDocuments({
    orderNumber: new RegExp(`^${prefix.replace(/-/g, "\\-")}`),
  });
  const seq = String(count + 1).padStart(3, "0");
  return `${prefix}${seq}`;
}

export async function buildOrderDraft(
  _customerId: mongoose.Types.ObjectId,
  lines: CheckoutLineInput[],
  shippingAddress: ShippingAddressInput
): Promise<{
  orderNumber: string;
  items: {
    product: mongoose.Types.ObjectId;
    name: string;
    slug: string;
    sku?: string;
    unitPrice: number;
    quantity: number;
    lineTotal: number;
    image?: string;
  }[];
  subtotal: number;
  tax: number;
  shipping: number;
  total: number;
}> {
  if (!lines?.length) throw new AppError(400, "Cart is empty");
  const slugCounts = new Map<string, number>();
  for (const line of lines) {
    const q = Math.floor(Number(line.quantity));
    if (!line.slug?.trim() || q < 1) throw new AppError(400, "Invalid line item");
    slugCounts.set(line.slug.trim(), (slugCounts.get(line.slug.trim()) ?? 0) + q);
  }

  const slugs = Array.from(slugCounts.keys());
  const products = await Product.find({
    slug: { $in: slugs },
    status: { $in: publishedStatuses },
  });

  const bySlug = new Map(products.map((p) => [p.slug, p]));
  const items: {
    product: mongoose.Types.ObjectId;
    name: string;
    slug: string;
    sku?: string;
    unitPrice: number;
    quantity: number;
    lineTotal: number;
    image?: string;
  }[] = [];
  let subtotal = 0;

  for (const [slug, quantity] of slugCounts.entries()) {
    const p = bySlug.get(slug);
    if (!p) throw new AppError(400, `Product not found or unavailable: ${slug}`);
    const unitPrice = p.salePrice ?? p.price;
    if (!(unitPrice >= 0)) throw new AppError(400, `Invalid price for ${slug}`);
    if (p.stock < quantity)
      throw new AppError(
        400,
        `${p.name} has insufficient stock (${p.stock} available, requested ${quantity})`
      );
    const lineTotal = Math.round(unitPrice * quantity * 100) / 100;
    subtotal += lineTotal;
    items.push({
      product: p._id,
      name: p.name,
      slug: p.slug,
      sku: p.sku ?? undefined,
      unitPrice,
      quantity,
      lineTotal,
      image: p.images?.[0],
    });
  }

  subtotal = Math.round(subtotal * 100) / 100;
  const GST = 0.03;
  const shipping = 0;
  const { tax, total } = normalizeOrderTotal(subtotal, GST, shipping);

  const addr = shippingAddress;
  const fullName = addr.fullName?.trim();
  const phone = addr.phone?.trim();
  const line1 = addr.line1?.trim();
  const city = addr.city?.trim();
  const state = addr.state?.trim();
  const pincode = addr.pincode?.trim();
  if (!fullName || !phone || !line1 || !city || !state || !pincode) {
    throw new AppError(400, "Complete shipping address required");
  }

  const orderNumber = await generateOrderNumber();

  return {
    orderNumber,
    items,
    subtotal,
    tax,
    shipping,
    total,
  };
}

export async function createPendingOrderFromDraft(args: {
  customerId: string;
  draft: Awaited<ReturnType<typeof buildOrderDraft>>;
  shippingAddress: ShippingAddressInput;
  razorpayOrderId: string;
}) {
  const cid = new mongoose.Types.ObjectId(args.customerId);
  const d = args.draft;

  const order = await Order.create({
    orderNumber: d.orderNumber,
    customer: cid,
    items: d.items,
    shippingAddress: {
      fullName: args.shippingAddress.fullName.trim(),
      phone: args.shippingAddress.phone.trim(),
      line1: args.shippingAddress.line1.trim(),
      city: args.shippingAddress.city.trim(),
      state: args.shippingAddress.state.trim(),
      pincode: args.shippingAddress.pincode.trim(),
      country: (args.shippingAddress.country ?? "IN").trim() || "IN",
    },
    subtotal: d.subtotal,
    tax: d.tax,
    shipping: d.shipping,
    total: d.total,
    currency: "INR",
    status: "pending_payment",
    paymentMethod: "online",
  });

  const amountPaise = Math.round(d.total * 100);

  const payment = await Payment.create({
    order: order._id,
    customer: cid,
    razorpayOrderId: args.razorpayOrderId,
    amount: amountPaise,
    currency: "INR",
    status: "created",
  });

  order.payment = payment._id;
  await order.save();

  return { order, payment };
}

async function decrementStock(session: mongoose.ClientSession | null, orderId: mongoose.Types.ObjectId) {
  const order = await Order.findById(orderId).session(session ?? null).exec();
  if (!order?.items?.length) return;
  const productAggregates = new Map<string, number>();
  for (const item of order.items) {
    const pid = item.product?.toString();
    if (!pid) continue;
    productAggregates.set(pid, (productAggregates.get(pid) ?? 0) + item.quantity);
  }
  for (const [pid, qty] of productAggregates.entries()) {
    const result = await Product.updateOne(
      { _id: pid, stock: { $gte: qty } },
      {
        $inc: { stock: -qty, soldCount: qty },
      }
    ).session(session ?? null);
    if (!result.modifiedCount) {
      throw new AppError(
        400,
        "Stock changed during checkout — order could not be fulfilled. Please retry."
      );
    }
  }
}

export async function markOrderPaid(args: {
  paymentDocId: mongoose.Types.ObjectId;
  razorpayPaymentId?: string;
  razorpaySignature?: string | null;
  method?: string;
  appendRaw?: Record<string, unknown>;
}): Promise<{ alreadyDone: boolean }> {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const paymentBefore = await Payment.findById(args.paymentDocId).session(session);
    if (!paymentBefore || !paymentBefore.order) {
      await session.abortTransaction();
      session.endSession();
      throw new AppError(404, "Payment not found");
    }
    if (paymentBefore.status === "captured") {
      await session.commitTransaction();
      session.endSession();
      return { alreadyDone: true };
    }

    const orderBefore = await Order.findById(paymentBefore.order).session(session);
    if (!orderBefore) {
      await session.abortTransaction();
      session.endSession();
      throw new AppError(404, "Order not found");
    }

    if (paymentBefore.order && orderBefore.status === "paid") {
      await session.commitTransaction();
      session.endSession();
      return { alreadyDone: true };
    }

    await decrementStock(session, orderBefore._id);

    paymentBefore.status = "captured";
    if (args.razorpayPaymentId) paymentBefore.razorpayPaymentId = args.razorpayPaymentId;
    if (args.razorpaySignature !== undefined) paymentBefore.razorpaySignature = args.razorpaySignature ?? undefined;
    if (args.method) paymentBefore.method = args.method;
    if (args.appendRaw) paymentBefore.rawPayload = { ...(paymentBefore.rawPayload ?? {}), ...args.appendRaw };
    await paymentBefore.save({ session });

    orderBefore.status = "paid";
    await orderBefore.save({ session });

    await session.commitTransaction();
    session.endSession();
    return { alreadyDone: false };
  } catch (e) {
    await session.abortTransaction();
    session.endSession();
    throw e;
  }
}

export async function markPaymentFailed(
  paymentId: mongoose.Types.ObjectId,
  reason?: string,
  appendRaw?: Record<string, unknown>
) {
  const payment = await Payment.findById(paymentId);
  if (!payment) return;
  if (payment.status === "captured") return;
  payment.status = "failed";
  payment.failureReason = reason ?? payment.failureReason;
  if (appendRaw) payment.rawPayload = { ...(payment.rawPayload ?? {}), ...appendRaw };
  await payment.save();

  await Order.updateOne({ _id: payment.order }, { status: "failed" });
}
