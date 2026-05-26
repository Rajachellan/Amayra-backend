import type { Request, Response, NextFunction } from "express";
import { Order } from "../models/Order.js";
import { AppError } from "../utils/AppError.js";
import {
  assignAwb,
  courierServiceability,
  createAdhocOrder,
  extractShipmentIdFromCreateResponse,
  extractSrOrderIdFromCreateResponse,
  listPickupLocations,
  type NormalizedPickup,
} from "../services/shiprocketService.js";

const BOOKABLE_STATUSES = ["paid", "processing", "shipped"] as const;

function orderCanBookShiprocket(o: { status: string; shiprocket?: { shipmentId?: string | null | undefined } | null }) {
  if (!(BOOKABLE_STATUSES as readonly string[]).includes(o.status)) return false;
  const sid = o.shiprocket?.shipmentId;
  if (typeof sid === "string" && sid.trim() !== "") return false;
  return true;
}

export async function getShiprocketPickups(_req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const items = await listPickupLocations();
    res.json({ items });
  } catch (e) {
    next(e);
  }
}

export async function getOrderShiprocketServiceability(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { id } = req.params;
    const weightKg = Number(req.query.weightKg);
    const pickupNickname = typeof req.query.pickup === "string" ? req.query.pickup.trim() : "";

    if (!pickupNickname) throw new AppError(400, "Query `pickup` (pickup location nickname) is required");
    if (!Number.isFinite(weightKg) || weightKg <= 0) throw new AppError(400, "Query `weightKg` must be a positive number");

    const order = await Order.findById(id).lean();
    if (!order) throw new AppError(404, "Order not found");
    if (!orderCanBookShiprocket(order)) {
      throw new AppError(400, "Order is not eligible for Shiprocket booking (must be paid/processing/shipped and not already booked)");
    }

    const pickups = await listPickupLocations();
    const pickup = pickups.find((p) => p.nickname === pickupNickname) as NormalizedPickup | undefined;
    if (!pickup) throw new AppError(400, "Unknown pickup location. Refresh pickup list from Shiprocket.");

    const deliveryPin = order.shippingAddress?.pincode?.replace(/\s/g, "") ?? "";
    if (!deliveryPin) throw new AppError(400, "Order has no delivery pincode");

    const cod = order.paymentMethod === "cod";
    const raw = await courierServiceability({
      pickupPostcode: pickup.pinCode,
      deliveryPostcode: deliveryPin,
      weightKg,
      cod,
    });

    res.json({ pickup, deliveryPincode: deliveryPin, raw });
  } catch (e) {
    next(e);
  }
}

function buildAdhocPayload(args: {
  order: {
    orderNumber: string;
    createdAt?: Date;
    subtotal: number;
    total: number;
    tax: number;
    shipping: number;
    shippingAddress: {
      fullName: string;
      phone: string;
      line1: string;
      city: string;
      state: string;
      pincode: string;
      country?: string;
    };
    items: { name: string; sku?: string; quantity: number; lineTotal: number }[];
    paymentMethod?: string;
  };
  customerEmail: string;
  pickupLocation: string;
  weightKg: number;
  lengthCm: number;
  breadthCm: number;
  heightCm: number;
}): Record<string, unknown> {
  const a = args.order.shippingAddress;
  const nameParts = a.fullName.trim().split(/\s+/);
  const first = nameParts[0] ?? "Customer";
  const last = nameParts.slice(1).join(" ") || ".";

  const orderDate = args.order.createdAt
    ? new Date(args.order.createdAt).toISOString().slice(0, 16).replace("T", " ")
    : new Date().toISOString().slice(0, 16).replace("T", " ");

  const prepaid = args.order.paymentMethod !== "cod";
  const orderItems = args.order.items.map((it, i) => ({
    name: it.name.slice(0, 200),
    sku: (it.sku ?? `item-${i + 1}`).toString().slice(0, 50),
    units: it.quantity,
    selling_price: String(Math.round((it.lineTotal / Math.max(1, it.quantity)) * 100) / 100),
  }));

  return {
    order_id: args.order.orderNumber.replace(/[^a-zA-Z0-9-_]/g, "-").slice(0, 48),
    order_date: orderDate,
    pickup_location: args.pickupLocation,
    billing_customer_name: first,
    billing_last_name: last,
    billing_address: a.line1,
    billing_city: a.city,
    billing_pincode: a.pincode.replace(/\s/g, ""),
    billing_state: a.state,
    billing_country: a.country === "IN" || !a.country ? "India" : a.country,
    billing_email: args.customerEmail,
    billing_phone: a.phone.replace(/\D/g, "").slice(0, 15),
    shipping_is_billing: true,
    shipping_customer_name: first,
    shipping_last_name: last,
    shipping_address: a.line1,
    shipping_city: a.city,
    shipping_pincode: a.pincode.replace(/\s/g, ""),
    shipping_state: a.state,
    shipping_country: a.country === "IN" || !a.country ? "India" : a.country,
    shipping_email: args.customerEmail,
    shipping_phone: a.phone.replace(/\D/g, "").slice(0, 15),
    order_items: orderItems,
    payment_method: prepaid ? "Prepaid" : "COD",
    sub_total: args.order.subtotal,
    length: args.lengthCm,
    breadth: args.breadthCm,
    height: args.heightCm,
    weight: args.weightKg,
  };
}

function parseAwbFromAssignResponse(data: Record<string, unknown>): {
  awb?: string;
  labelUrl?: string;
  courierName?: string;
} {
  const response = data.response as Record<string, unknown> | undefined;
  const payload = (response?.data ?? data.payload ?? data) as Record<string, unknown>;
  const awb =
    (typeof payload.awb_code === "string" && payload.awb_code) ||
    (typeof payload.awb === "string" && payload.awb) ||
    (typeof data.awb_code === "string" && data.awb_code) ||
    undefined;
  const labelUrl =
    (typeof payload.label_url === "string" && payload.label_url) ||
    (typeof (payload as { label?: string }).label === "string" && (payload as { label: string }).label) ||
    undefined;

  const courierName =
    (typeof payload.courier_name === "string" && payload.courier_name) ||
    (typeof (data as { courier_name?: string }).courier_name === "string"
      ? (data as { courier_name: string }).courier_name
      : undefined);

  return { awb, labelUrl, courierName };
}

export async function postOrderShiprocketShipment(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { id } = req.params;
    const body = req.body as {
      pickupLocation?: string;
      courierId?: number;
      weightKg?: number;
      lengthCm?: number;
      breadthCm?: number;
      heightCm?: number;
      forceReplace?: boolean;
    };

    const pickupLocation = typeof body.pickupLocation === "string" ? body.pickupLocation.trim() : "";
    const courierId = Number(body.courierId);
    const weightKg = Number(body.weightKg);
    const lengthCm = Number(body.lengthCm) || 10;
    const breadthCm = Number(body.breadthCm) || 10;
    const heightCm = Number(body.heightCm) || 5;

    if (!pickupLocation) throw new AppError(400, "pickupLocation required");
    if (!Number.isFinite(courierId) || courierId < 1) throw new AppError(400, "courierId required");
    if (!Number.isFinite(weightKg) || weightKg <= 0) throw new AppError(400, "weightKg must be positive");

    const orderDoc = await Order.findById(id).populate("customer", "email name");
    if (!orderDoc) throw new AppError(404, "Order not found");

    if (orderDoc.shiprocket?.shipmentId && !body.forceReplace) {
      throw new AppError(409, "Shipment already exists for this order. Pass forceReplace: true to re-book (destructive)");
    }

    if (!((BOOKABLE_STATUSES as readonly string[]).includes(orderDoc.status))) {
      throw new AppError(400, "Order must be paid/processing/shipped before booking Shiprocket");
    }

    if (body.forceReplace && orderDoc.shiprocket?.shipmentId) {
      await Order.updateOne({ _id: orderDoc._id }, { $unset: { shiprocket: 1 } });
    }

    const fresh = await Order.findById(id).populate("customer", "email name");
    if (!fresh) throw new AppError(404, "Order not found");

    const cust = fresh.customer as { email?: string } | null;
    const customerEmail = cust?.email?.trim() || process.env.SHIPROCKET_FALLBACK_EMAIL || "noreply@amayra.local";

    const adhocPayload = buildAdhocPayload({
      order: {
        orderNumber: fresh.orderNumber,
        createdAt: fresh.createdAt,
        subtotal: fresh.subtotal,
        total: fresh.total,
        tax: fresh.tax,
        shipping: fresh.shipping,
        shippingAddress: fresh.shippingAddress,
        items: fresh.items.map((it) => ({
          name: it.name,
          sku: it.sku ?? undefined,
          quantity: it.quantity,
          lineTotal: it.lineTotal,
        })),
        paymentMethod: fresh.paymentMethod,
      },
      customerEmail,
      pickupLocation,
      weightKg,
      lengthCm,
      breadthCm,
      heightCm,
    });

    const created = await createAdhocOrder(adhocPayload);
    const shipmentIdStr = extractShipmentIdFromCreateResponse(created);
    const srOrderId = extractSrOrderIdFromCreateResponse(created);

    if (!shipmentIdStr) {
      throw new AppError(
        502,
        `Shiprocket order created but shipment id missing in response: ${JSON.stringify(created).slice(0, 500)}`
      );
    }

    const assignRes = await assignAwb(shipmentIdStr, courierId);
    const parsed = parseAwbFromAssignResponse(assignRes);

    const trackingUrl = parsed.awb
      ? `https://shiprocket.co/tracking/${encodeURIComponent(parsed.awb)}`
      : undefined;

    fresh.set("shiprocket", {
      srOrderId: srOrderId ?? undefined,
      shipmentId: shipmentIdStr,
      awbCode: parsed.awb,
      courierId,
      courierName: parsed.courierName,
      labelUrl: parsed.labelUrl,
      trackingUrl,
      pickupLocation,
      syncedAt: new Date(),
      lastStatus: "awb_assigned",
      weightKg,
      lengthCm,
      breadthCm,
      heightCm,
    });
    await fresh.save();

    const updated = await Order.findById(fresh._id)
      .populate("customer", "name email phone")
      .populate("payment", "status amount razorpayOrderId razorpayPaymentId method");

    res.status(201).json({
      order: updated,
      shiprocketCreate: created,
      shiprocketAssign: assignRes,
    });
  } catch (e) {
    next(e);
  }
}
