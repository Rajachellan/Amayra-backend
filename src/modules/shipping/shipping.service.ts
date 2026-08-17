import mongoose from "mongoose";
import { Order } from "../order/model.js";
import { AppError } from "../../utils/AppError.js";
import { recordOrderEvent } from "../order/order.service.js";
import * as shiprocketClient from "./shiprocket.client.js";
import { logger } from "../../config/logger.js";

export type CourierQuote = {
  courierId: number;
  courierName: string;
  rate: number;
  estimatedDelivery: string;
  serviceType: string;
  codAvailable: boolean;
};

/**
 * Validates order and retrieves normalized courier rates from Shiprocket.
 */
export async function getCourierRates(
  orderId: string | mongoose.Types.ObjectId,
  weightKg: number,
  pickupNickname: string
): Promise<CourierQuote[]> {
  const order = await Order.findById(orderId).lean();
  if (!order) throw new AppError(404, "Order not found");

  // Validate payment eligibility: PREPAID must be CAPTURED. COD is eligible if CONFIRMED.
  if (order.paymentMethod === "PREPAID" && order.paymentStatus !== "CAPTURED") {
    throw new AppError(400, "Prepaid order payment must be captured before shipping lookup");
  }
  if (order.orderStatus === "CANCELLED" || order.orderStatus === "DELIVERED") {
    throw new AppError(400, `Cannot lookup rates for order in ${order.orderStatus} status`);
  }

  const pickups = await shiprocketClient.listPickupLocations();
  const pickup = pickups.find((p) => p.nickname === pickupNickname);
  if (!pickup) throw new AppError(400, `Pickup location '${pickupNickname}' not found`);

  const deliveryPincode = order.shippingAddress.pincode.replace(/\s/g, "");
  if (!deliveryPincode) throw new AppError(400, "Order delivery pincode is missing");

  const isCod = order.paymentMethod === "COD";

  const rawRes = (await shiprocketClient.courierServiceability({
    pickupPostcode: pickup.pinCode,
    deliveryPostcode: deliveryPincode,
    weightKg,
    cod: isCod,
  })) as any;

  const data = rawRes.data || rawRes;
  const courierList = data.available_courier_companies;
  if (!Array.isArray(courierList)) return [];

  return courierList.map((c: any) => ({
    courierId: Number(c.courier_company_id ?? c.id),
    courierName: String(c.courier_name ?? c.name ?? "Courier"),
    rate: Number(c.freight_charge ?? c.rate ?? 0),
    estimatedDelivery: String(c.etd ?? c.estimated_delivery_days ?? "—"),
    serviceType: String(c.service_type || "Standard"),
    codAvailable: c.cod === 1,
  }));
}

/**
 * Books shipment with Shiprocket in an idempotent manner.
 */
export async function bookShipment(args: {
  orderId: string | mongoose.Types.ObjectId;
  pickupLocation: string;
  courierId: number;
  weightKg: number;
  lengthCm: number;
  breadthCm: number;
  heightCm: number;
}): Promise<any> {
  const order = await Order.findById(args.orderId).populate("customer", "email name");
  if (!order) throw new AppError(404, "Order not found");

  // IDEMPOTENCY check
  if (order.shippingInfo?.shipmentId) {
    logger.info(
      `Shipment already booked for order ${order.orderNumber}. Returning existing details.`
    );
    return {
      order,
      alreadyBooked: true,
    };
  }

  // Payment eligibility check
  if (order.paymentMethod === "PREPAID" && order.paymentStatus !== "CAPTURED") {
    throw new AppError(400, "Cannot book shipment for unpaid prepaid order");
  }

  if (order.orderStatus === "CANCELLED" || order.orderStatus === "DELIVERED") {
    throw new AppError(400, `Cannot book shipment for order in ${order.orderStatus} status`);
  }

  const cust = order.customer as { email?: string } | null;
  const customerEmail =
    cust?.email?.trim() || process.env.SHIPROCKET_FALLBACK_EMAIL || "noreply@mairiijewels.com";

  // Build Adhoc Order payload for Shiprocket
  const a = order.shippingAddress;
  const nameParts = a.fullName.trim().split(/\s+/);
  const first = nameParts[0] ?? "Customer";
  const last = nameParts.slice(1).join(" ") || ".";

  const orderDate = order.createdAt
    ? new Date(order.createdAt).toISOString().slice(0, 16).replace("T", " ")
    : new Date().toISOString().slice(0, 16).replace("T", " ");

  const prepaid = order.paymentMethod !== "COD";
  const orderItems = order.items.map((it, i) => ({
    name: it.name.slice(0, 200),
    sku: (it.sku ?? `item-${i + 1}`).toString().slice(0, 50),
    units: it.quantity,
    selling_price: String(Math.round((it.lineTotal / Math.max(1, it.quantity)) * 100) / 100),
  }));

  const adhocPayload = {
    order_id: order.orderNumber.replace(/[^a-zA-Z0-9-_]/g, "-").slice(0, 48),
    order_date: orderDate,
    pickup_location: args.pickupLocation,
    billing_customer_name: first,
    billing_last_name: last,
    billing_address: a.line1,
    billing_city: a.city,
    billing_pincode: a.pincode.replace(/\s/g, ""),
    billing_state: a.state,
    billing_country: a.country === "IN" || !a.country ? "India" : a.country,
    billing_email: customerEmail,
    billing_phone: a.phone.replace(/\D/g, "").slice(0, 15),
    shipping_is_billing: true,
    shipping_customer_name: first,
    shipping_last_name: last,
    shipping_address: a.line1,
    shipping_city: a.city,
    shipping_pincode: a.pincode.replace(/\s/g, ""),
    shipping_state: a.state,
    shipping_country: a.country === "IN" || !a.country ? "India" : a.country,
    shipping_email: customerEmail,
    shipping_phone: a.phone.replace(/\D/g, "").slice(0, 15),
    order_items: orderItems,
    payment_method: prepaid ? "Prepaid" : "COD",
    sub_total: order.subtotal,
    length: args.lengthCm,
    breadth: args.breadthCm,
    height: args.heightCm,
    weight: args.weightKg,
  };

  logger.info(`Calling Shiprocket Create Adhoc Order for Order: ${order.orderNumber}`);
  const created = await shiprocketClient.createAdhocOrder(adhocPayload);

  const shipmentIdStr = shiprocketClient.extractShipmentIdFromCreateResponse(created);
  const srOrderId = shiprocketClient.extractSrOrderIdFromCreateResponse(created);

  if (!shipmentIdStr) {
    throw new AppError(
      502,
      `Shiprocket order created but shipment id missing in response: ${JSON.stringify(created).slice(0, 300)}`
    );
  }

  logger.info(`Calling Shiprocket Assign AWB for Shipment: ${shipmentIdStr}`);
  const assignRes = await shiprocketClient.assignAwb(shipmentIdStr, args.courierId);

  // Parse response
  const response = assignRes.response as Record<string, any> | undefined;
  const payload = (response?.data ?? assignRes.payload ?? assignRes) as Record<string, any>;
  const awb =
    (typeof payload.awb_code === "string" && payload.awb_code) ||
    (typeof payload.awb === "string" && payload.awb) ||
    (typeof assignRes.awb_code === "string" && assignRes.awb_code) ||
    undefined;
  const _labelUrl =
    (typeof payload.label_url === "string" && payload.label_url) ||
    (typeof payload.label === "string" && payload.label) ||
    undefined;
  const courierName =
    (typeof payload.courier_name === "string" && payload.courier_name) ||
    (typeof assignRes.courier_name === "string" ? assignRes.courier_name : undefined);

  const trackingUrl = awb ? `https://shiprocket.co/tracking/${encodeURIComponent(awb)}` : undefined;

  const previousOrderStatus = order.orderStatus;

  // Save new shipping info
  order.shippingStatus = "AWB_GENERATED";
  order.orderStatus = "SHIPPED";
  order.shippingInfo = {
    provider: "SHIPROCKET",
    shiprocketOrderId: srOrderId ?? undefined,
    shipmentId: shipmentIdStr,
    courierId: args.courierId,
    courierName: courierName || "Courier",
    awbCode: awb,
    trackingUrl,
    status: "AWB_GENERATED",
    pickupScheduledAt: undefined,
    shippedAt: new Date(),
    deliveredAt: undefined,
    estimatedDeliveryDate: undefined,
  };

  // Pre-save hook will automatically sync legacy `shiprocket` subdoc & legacy `status` field!
  await order.save();

  // Record audit event
  await recordOrderEvent({
    orderId: order._id,
    eventType: "SHIPMENT_BOOKED",
    previousStatus: previousOrderStatus,
    newStatus: "SHIPPED",
    source: "SYSTEM",
    metadata: {
      shipmentId: shipmentIdStr,
      srOrderId,
      awb,
      courierName,
    },
  });

  return {
    order,
    alreadyBooked: false,
    shiprocketCreate: created,
    shiprocketAssign: assignRes,
  };
}

import { mapShiprocketToMairiiShippingStatus, mapShippingToOrderStatus } from "./status.mapper.js";

/**
 * Processes live courier status updates from Shiprocket tracking webhook.
 */
export async function processShiprocketTrackingUpdate(
  awbCode: string,
  rawStatus: string,
  rawPayload: Record<string, any>
): Promise<void> {
  const order = await Order.findOne({
    $or: [{ "shippingInfo.awbCode": awbCode }, { "shiprocket.awbCode": awbCode }],
  });

  if (!order) {
    logger.warn(`No order found for AWB: ${awbCode}`);
    return;
  }

  const prevOrderStatus = order.orderStatus;
  const _prevShippingStatus = order.shippingStatus;

  const mappedShipping = mapShiprocketToMairiiShippingStatus(rawStatus);
  order.shippingStatus = mappedShipping;
  order.shippingInfo.status = mappedShipping;

  if (rawPayload.etd || rawPayload.edd) {
    order.shippingInfo.estimatedDeliveryDate = new Date(rawPayload.etd || rawPayload.edd);
  }

  if (mappedShipping === "DELIVERED") {
    order.shippingInfo.deliveredAt = new Date();
    if (order.paymentMethod === "COD") {
      order.paymentStatus = "COD_COLLECTED";
      order.paymentInfo.status = "COD_COLLECTED";
      order.paymentInfo.codCollectedAt = new Date();
    }
  } else if (mappedShipping === "PICKED_UP") {
    order.shippingInfo.shippedAt = new Date();
  }

  // Update order status if mapped status is applicable
  const mappedOrder = mapShippingToOrderStatus(mappedShipping);
  if (mappedOrder) {
    order.orderStatus = mappedOrder;
  }

  await order.save();

  // Record audit history
  let eventType = "SHIPMENT_UPDATED";
  if (mappedShipping === "DELIVERED") {
    eventType = "SHIPMENT_DELIVERED";
  } else if (mappedShipping.startsWith("RTO_")) {
    eventType = "SHIPMENT_RTO_INITIATED";
  }

  await recordOrderEvent({
    orderId: order._id,
    eventType,
    previousStatus: prevOrderStatus,
    newStatus: order.orderStatus,
    source: "SHIPROCKET",
    metadata: {
      awbCode,
      rawStatus,
      mappedShippingStatus: mappedShipping,
      payload: rawPayload,
    },
  });
}
