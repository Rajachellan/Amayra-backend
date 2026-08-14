import type { Request, Response, NextFunction } from "express";
import { AppError } from "../../utils/AppError.js";
import * as shippingService from "./shipping.service.js";
import * as shiprocketClient from "./shiprocket.client.js";

/**
 * Retrieves all pickup locations from Shiprocket.
 */
export async function getShiprocketPickups(
  _req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const items = await shiprocketClient.listPickupLocations();
    res.json({ items });
  } catch (e) {
    next(e);
  }
}

/**
 * Retrieves courier rates and serviceability for an order.
 * Returns the raw response under `raw` to preserve compatibility with the admin panel.
 */
export async function getOrderShiprocketServiceability(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const id = req.params.id as string;
    const weightKg = Number(req.query.weightKg);
    const pickupNickname = typeof req.query.pickup === "string" ? req.query.pickup.trim() : "";

    if (!pickupNickname) {
      throw new AppError(400, "Query param `pickup` (pickup location nickname) is required");
    }
    if (!Number.isFinite(weightKg) || weightKg <= 0) {
      throw new AppError(400, "Query param `weightKg` must be a positive number");
    }

    const pickups = await shiprocketClient.listPickupLocations();
    const pickup = pickups.find((p) => p.nickname === pickupNickname);
    if (!pickup) {
      throw new AppError(400, "Unknown pickup location. Refresh pickup list.");
    }

    const rates = await shippingService.getCourierRates(id, weightKg, pickupNickname);

    // Get order address info
    const { Order } = await import("../order/model.js");
    const order = await Order.findById(id).lean();
    if (!order) throw new AppError(404, "Order not found");

    const rawServiceability = await shiprocketClient.courierServiceability({
      pickupPostcode: pickup.pinCode,
      deliveryPostcode: order.shippingAddress.pincode.replace(/\s/g, ""),
      weightKg,
      cod: order.paymentMethod === "COD",
    });

    res.json({
      pickup,
      deliveryPincode: order.shippingAddress.pincode,
      raw: rawServiceability,
      normalized: rates,
    });
  } catch (e) {
    next(e);
  }
}

/**
 * Idempotently books a courier shipment for an order.
 */
export async function postOrderShiprocketShipment(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const id = req.params.id as string;
    const body = req.body as {
      pickupLocation?: string;
      courierId?: number;
      weightKg?: number;
      lengthCm?: number;
      breadthCm?: number;
      heightCm?: number;
    };

    const pickupLocation = typeof body.pickupLocation === "string" ? body.pickupLocation.trim() : "";
    const courierId = Number(body.courierId);
    const weightKg = Number(body.weightKg);
    const lengthCm = Number(body.lengthCm) || 10;
    const breadthCm = Number(body.breadthCm) || 10;
    const heightCm = Number(body.heightCm) || 5;

    if (!pickupLocation) throw new AppError(400, "pickupLocation is required");
    if (!Number.isFinite(courierId) || courierId < 1) throw new AppError(400, "courierId is required");
    if (!Number.isFinite(weightKg) || weightKg <= 0) throw new AppError(400, "weightKg must be positive");

    const result = await shippingService.bookShipment({
      orderId: id,
      pickupLocation,
      courierId,
      weightKg,
      lengthCm,
      breadthCm,
      heightCm,
    });

    res.status(201).json({
      order: result.order,
      shiprocketCreate: result.shiprocketCreate || {},
      shiprocketAssign: result.shiprocketAssign || {},
      alreadyBooked: result.alreadyBooked,
    });
  } catch (e) {
    next(e);
  }
}

import { shouldProcessWebhookEvent, markWebhookEventProcessed, markWebhookEventFailed } from "../webhook/webhook.service.js";
import { logger } from "../../config/logger.js";

/**
 * Handle incoming Shiprocket tracking webhook notifications.
 */
export async function postShiprocketWebhook(req: Request, res: Response): Promise<void> {
  let eventId = "";
  try {
    const token = process.env.SHIPROCKET_WEBHOOK_TOKEN;
    const headerToken = req.headers["x-api-key"] || req.headers["authorization"];
    if (token && headerToken !== token) {
      res.status(401).send("Unauthorized Webhook Token");
      return;
    }

    const body = req.body;
    const awb = body.awb || body.awb_code;
    const status = body.current_status || body.status;

    if (!awb || !status) {
      res.status(200).json({ ignored: true, reason: "Missing AWB or status" });
      return;
    }

    eventId = `${awb}_${status}`.replace(/\s+/g, "_");
    const should = await shouldProcessWebhookEvent("SHIPROCKET", eventId, "tracking_update");
    if (!should) {
      res.status(200).json({ ok: true, duplicate: true });
      return;
    }

    await shippingService.processShiprocketTrackingUpdate(awb, status, body);
    await markWebhookEventProcessed("SHIPROCKET", eventId);

    res.status(200).json({ ok: true });
  } catch (err: any) {
    logger.error({ err }, "Shiprocket Webhook execution failed");
    if (eventId) {
      await markWebhookEventFailed("SHIPROCKET", eventId, err.message || String(err));
    }
    res.status(500).json({ ok: false, error: err.message });
  }
}

