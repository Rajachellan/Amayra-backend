import mongoose from "mongoose";
import { Product } from "../../models/Product.js";
import { Order } from "../../models/Order.js";
import { Payment } from "../../models/Payment.js";
import { PromotionalBanner } from "../../models/PromotionalBanner.js";
import { AppError } from "../../utils/AppError.js";

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
  shippingAddress: ShippingAddressInput,
  couponCode?: string
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
  discount: number;
  tax: number;
  shipping: number;
  total: number;
  couponCode?: string;
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

  let discount = 0;
  if (couponCode) {
    const code = couponCode.trim().toUpperCase();
    if (code === "WELCOME5") {
      discount = Math.round(subtotal * 0.05 * 100) / 100;
    } else {
      const banner = await PromotionalBanner.findOne({
        couponCode: { $regex: new RegExp(`^${code}$`, "i") },
      });
      if (banner) {
        let pct = 0.05;
        const match = code.match(/\d+/);
        if (match) {
          const val = parseInt(match[0], 10);
          if (val > 0 && val <= 100) pct = val / 100;
        }
        discount = Math.round(subtotal * pct * 100) / 100;
      } else {
        throw new AppError(400, `Invalid coupon code: ${couponCode}`);
      }
    }
  }

  // 2. Extra 10% Off for subtotal >= 3499
  let milestoneDiscount = 0;
  if (subtotal >= 3499) {
    milestoneDiscount = Math.round(subtotal * 0.1 * 100) / 100;
    discount += milestoneDiscount;
  }

  // 3. Shipping charges: Free above 1499, else 199
  const shipping = subtotal > 0 && subtotal < 1499 ? 199 : 0;

  // 4. Free Gift for subtotal >= 6999
  if (subtotal >= 6999) {
    items.push({
      product: new mongoose.Types.ObjectId("600000000000000000000799"),
      name: "Free Gift (Worth ₹799)",
      slug: "free-gift-worth-799",
      sku: "GIFT799",
      unitPrice: 0,
      quantity: 1,
      lineTotal: 0,
      image: "/images/gift-box.webp",
    });
  }

  const GST = 0;
  const { tax, total } = normalizeOrderTotal(subtotal - discount, GST, shipping);

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
    discount,
    tax,
    shipping,
    total,
    couponCode: couponCode ? couponCode.trim().toUpperCase() : undefined,
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
    discount: d.discount,
    couponCode: d.couponCode,
    tax: d.tax,
    shipping: d.shipping,
    total: d.total,
    currency: "INR",
    status: "pending_payment",
    orderStatus: "PENDING",
    paymentStatus: "PENDING",
    shippingStatus: "NOT_CREATED",
    returnStatus: "NOT_REQUESTED",
    refundStatus: "NOT_APPLICABLE",
    paymentMethod: "PREPAID",
    paymentInfo: {
      provider: "RAZORPAY",
      razorpayOrderId: args.razorpayOrderId,
      status: "PENDING",
    },
    shippingInfo: {
      provider: "SHIPROCKET",
      status: "NOT_CREATED",
    },
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

import { processPrepaidPaymentCapture, processPaymentFailure } from "../payment/payment.service.js";

export async function markOrderPaid(args: {
  paymentDocId: mongoose.Types.ObjectId;
  razorpayPaymentId?: string;
  razorpaySignature?: string | null;
  method?: string;
  appendRaw?: Record<string, unknown>;
}): Promise<{ alreadyDone: boolean }> {
  return processPrepaidPaymentCapture(args);
}

export async function markPaymentFailed(
  paymentId: mongoose.Types.ObjectId,
  reason?: string,
  appendRaw?: Record<string, unknown>
): Promise<void> {
  return processPaymentFailure(paymentId, reason, appendRaw);
}

export async function createCodOrderFromDraft(args: {
  customerId: string;
  draft: Awaited<ReturnType<typeof buildOrderDraft>>;
  shippingAddress: ShippingAddressInput;
}) {
  const cid = new mongoose.Types.ObjectId(args.customerId);
  const d = args.draft;

  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const order = await Order.create([{
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
      discount: d.discount,
      couponCode: d.couponCode,
      tax: d.tax,
      shipping: d.shipping,
      total: d.total,
      currency: "INR",
      status: "processing", // Legacy: COD starts as processing
      orderStatus: "CONFIRMED",
      paymentStatus: "COD_PENDING",
      shippingStatus: "NOT_CREATED",
      returnStatus: "NOT_REQUESTED",
      refundStatus: "NOT_APPLICABLE",
      paymentMethod: "COD",
      paymentInfo: {
        provider: "COD",
        status: "COD_PENDING",
        codAmount: d.total,
      },
      shippingInfo: {
        provider: "SHIPROCKET",
        status: "NOT_CREATED",
      },
    }], { session });

    const createdOrder = order[0];

    const { decrementStockForOrder } = await import("../inventory/inventory.service.js");
    await decrementStockForOrder(session, createdOrder, "CUSTOMER");

    await session.commitTransaction();
    session.endSession();

    const { recordOrderEvent } = await import("../order/order.service.js");
    await recordOrderEvent({
      orderId: createdOrder._id,
      eventType: "ORDER_CREATED",
      previousStatus: undefined,
      newStatus: "CONFIRMED",
      source: "CUSTOMER",
      metadata: {
        paymentMethod: "COD",
      },
    });

    return createdOrder;
  } catch (err) {
    await session.abortTransaction();
    session.endSession();
    throw err;
  }
}


