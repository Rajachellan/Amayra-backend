import mongoose from "mongoose";
import { randomUUID } from "node:crypto";
import { Product } from "../../models/Product.js";
import { InventoryLedger } from "./model.js";
import { InventoryReservation } from "./reservation.model.js";
import { AppError } from "../../utils/AppError.js";
import { logger } from "../../config/logger.js";
import { recordOrderEvent } from "../order/order.service.js";

export interface InventoryReservationLine {
  product?: mongoose.Types.ObjectId | string;
  productId?: mongoose.Types.ObjectId | string;
  sku?: string | null;
  quantity: number;
  unitPrice?: number;
  name?: string;
  inventoryTracked?: boolean;
  isPromotionalGift?: boolean;
}

/**
 * Creates atomic inventory reservations for an order during checkout.
 * Uses atomic conditional updates to prevent overselling.
 */
export async function createInventoryReservations(
  session: mongoose.ClientSession | null,
  customerId: mongoose.Types.ObjectId | string,
  orderId: mongoose.Types.ObjectId | string,
  lines: InventoryReservationLine[],
  ttlMinutes = 15
): Promise<any> {
  if (!lines || !lines.length) {
    throw new AppError(400, "Cannot create reservation with empty lines");
  }

  // Idempotency: Check if reservation already exists for this order
  const existing = await InventoryReservation.findOne({
    orderId,
    status: { $in: ["ACTIVE", "CONVERTED"] },
  }).session(session);

  if (existing) {
    if (existing.status === "ACTIVE") return existing;
    throw new AppError(400, "Reservation already converted for this order");
  }

  const reservationItems: Array<{
    productId: mongoose.Types.ObjectId;
    sku: string;
    quantity: number;
    unitPrice: number;
  }> = [];

  const aggregates = new Map<
    string,
    { qty: number; sku: string; unitPrice: number; name?: string }
  >();

  for (const line of lines) {
    if (
      line.inventoryTracked === false ||
      line.isPromotionalGift === true ||
      line.sku === "GIFT799"
    ) {
      // Non-inventory promotional gift: record order audit event without physical inventory decrement
      await recordOrderEvent({
        orderId: new mongoose.Types.ObjectId(orderId.toString()),
        eventType: "PROMOTIONAL_GIFT_DISPATCH",
        source: "SYSTEM",
        metadata: {
          sku: line.sku,
          name: line.name,
          quantity: line.quantity,
          giftReason: "PROMOTIONAL_REWARD",
        },
      });
      continue;
    }

    const pid = (line.product || line.productId)?.toString();
    if (!pid) continue;

    if (!Number.isInteger(line.quantity) || line.quantity <= 0) {
      throw new AppError(400, `Invalid reservation quantity: ${line.quantity}`);
    }

    const current = aggregates.get(pid);
    aggregates.set(pid, {
      qty: (current?.qty ?? 0) + line.quantity,
      sku: line.sku || current?.sku || "",
      unitPrice: line.unitPrice ?? current?.unitPrice ?? 0,
      name: line.name || current?.name,
    });
  }

  // If no items require inventory tracking (e.g. only promotional gifts), return null
  if (aggregates.size === 0) {
    return null;
  }

  // Perform atomic reservation for each product
  for (const [pid, data] of aggregates.entries()) {
    const product = await Product.findById(pid).session(session);
    if (!product) {
      throw new AppError(404, `Product not found: ${pid}`);
    }

    if (product.inventoryTracked === false || product.isPromotionalGift === true) {
      continue;
    }

    if (product.stock < data.qty) {
      throw new AppError(
        400,
        `${product.name} has insufficient stock (${product.stock} available, requested ${data.qty})`
      );
    }

    // Atomic conditional decrement of stock and increment of reservedStock
    const result = await Product.updateOne(
      {
        _id: pid,
        stock: { $gte: data.qty },
        inventoryTracked: { $ne: false },
        isPromotionalGift: { $ne: true },
      },
      {
        $inc: {
          stock: -data.qty,
          reservedStock: data.qty,
        },
      },
      { session: session ?? undefined }
    );

    if (!result.modifiedCount) {
      throw new AppError(400, `Stock changed concurrently for ${product.name}. Please retry.`);
    }

    reservationItems.push({
      productId: new mongoose.Types.ObjectId(pid),
      sku: data.sku || product.sku || "UNKNOWN_SKU",
      quantity: data.qty,
      unitPrice: data.unitPrice || product.price,
    });
  }

  const reservationId = `res_${randomUUID().replace(/-/g, "")}`;
  const expiresAt = new Date(Date.now() + ttlMinutes * 60 * 1000);

  const [reservation] = await InventoryReservation.create(
    [
      {
        reservationId,
        orderId: new mongoose.Types.ObjectId(orderId.toString()),
        customerId: new mongoose.Types.ObjectId(customerId.toString()),
        items: reservationItems,
        status: "ACTIVE",
        expiresAt,
      },
    ],
    { session: session ?? undefined }
  );

  logger.info(
    `[InventoryReservation] Created reservation ${reservationId} for order ${orderId} (expires ${expiresAt.toISOString()})`
  );

  return reservation;
}

/**
 * Converts an ACTIVE inventory reservation into a permanent SALE.
 * Decrements reservedStock and increments soldCount.
 * Available stock is NOT decremented again (preventing double deduction).
 */
export async function convertReservationsToSale(
  session: mongoose.ClientSession | null,
  order: any,
  paymentId?: string,
  createdBy = "RAZORPAY"
): Promise<{ converted: boolean; alreadyDone: boolean }> {
  const orderId = order._id;

  const reservation = await InventoryReservation.findOne({ orderId }).session(session);

  // Fallback for legacy orders without reservations
  if (!reservation) {
    logger.warn(
      `[InventoryReservation] No reservation found for order ${orderId}; falling back to direct decrement.`
    );
    await decrementStockForOrder(session, order, createdBy);
    return { converted: true, alreadyDone: false };
  }

  // Idempotent check: if already converted, no-op
  if (reservation.status === "CONVERTED") {
    logger.info(
      `[InventoryReservation] Reservation ${reservation.reservationId} already converted to sale.`
    );
    return { converted: false, alreadyDone: true };
  }

  if (reservation.status !== "ACTIVE") {
    throw new AppError(
      400,
      `Cannot convert reservation ${reservation.reservationId} with status ${reservation.status}`
    );
  }

  // Atomic state transition from ACTIVE to CONVERTED
  const updateRes = await InventoryReservation.updateOne(
    { _id: reservation._id, status: "ACTIVE" },
    {
      $set: {
        status: "CONVERTED",
        convertedAt: new Date(),
        paymentId: paymentId || reservation.paymentId,
      },
    },
    { session: session ?? undefined }
  );

  if (!updateRes.modifiedCount) {
    const current = await InventoryReservation.findById(reservation._id).session(session);
    if (current?.status === "CONVERTED") {
      return { converted: false, alreadyDone: true };
    }
    throw new AppError(400, "Reservation state changed concurrently");
  }

  // Stock accounting: stock remains unchanged, reservedStock decreases, soldCount increases
  for (const item of reservation.items) {
    const pid = item.productId.toString();
    const qty = item.quantity;

    const product = await Product.findById(pid).session(session);
    const previousStock = product ? product.stock : 0;

    await Product.updateOne(
      { _id: pid },
      {
        $inc: {
          reservedStock: -qty,
          soldCount: qty,
          trendingScore: qty,
        },
      },
      { session: session ?? undefined }
    );

    // Create SALE InventoryLedger
    await InventoryLedger.create(
      [
        {
          productId: item.productId,
          quantity: -qty,
          type: "SALE",
          referenceType: "ORDER",
          referenceId: orderId,
          previousStock,
          newStock: previousStock,
          createdBy,
        },
      ],
      { session: session ?? undefined }
    );

    logger.info(
      `[InventoryReservation] Converted item ${item.sku} (qty: ${qty}) for order ${orderId}. Available stock: ${previousStock}.`
    );
  }

  return { converted: true, alreadyDone: false };
}

/**
 * Releases ACTIVE inventory reservations back to available stock.
 * Restores stock and decrements reservedStock.
 * Safe to call multiple times (only releases ACTIVE reservations).
 */
export async function releaseInventoryReservations(
  orderId: mongoose.Types.ObjectId | string,
  reason: string,
  releasedBy = "SYSTEM"
): Promise<{ released: boolean }> {
  const reservation = await InventoryReservation.findOne({ orderId, status: "ACTIVE" });
  if (!reservation) {
    return { released: false };
  }

  // Atomic state transition ACTIVE -> RELEASED
  const updated = await InventoryReservation.findOneAndUpdate(
    { _id: reservation._id, status: "ACTIVE" },
    {
      $set: {
        status: "RELEASED",
        releasedAt: new Date(),
        releaseReason: reason,
      },
    },
    { new: true }
  );

  if (!updated) {
    return { released: false };
  }

  // Restore available stock and decrement reservedStock
  for (const item of updated.items) {
    await Product.updateOne(
      { _id: item.productId },
      {
        $inc: {
          stock: item.quantity,
          reservedStock: -item.quantity,
        },
      }
    );
  }

  await recordOrderEvent({
    orderId: new mongoose.Types.ObjectId(orderId.toString()),
    eventType: "RESERVATION_RELEASED",
    source: ["CUSTOMER", "ADMIN", "RAZORPAY", "SHIPROCKET", "SYSTEM"].includes(releasedBy)
      ? (releasedBy as any)
      : "SYSTEM",
    metadata: {
      reservationId: updated.reservationId,
      reason,
      releasedAt: updated.releasedAt,
      itemsCount: updated.items.length,
    },
  });

  logger.info(
    `[InventoryReservation] Released reservation ${updated.reservationId} for order ${orderId} (reason: ${reason})`
  );

  return { released: true };
}

/**
 * Decrements stock for products in an order and creates a SALE ledger entry for each.
 * Used for direct orders (e.g. COD) or backward compatibility.
 */
export async function decrementStockForOrder(
  session: mongoose.ClientSession | null,
  order: any,
  createdBy = "SYSTEM"
): Promise<void> {
  if (!order?.items?.length) return;

  const productAggregates = new Map<string, number>();
  for (const item of order.items) {
    if (
      item.inventoryTracked === false ||
      item.isPromotionalGift === true ||
      item.sku === "GIFT799"
    ) {
      // Non-inventory promotional gift: record order event audit without physical inventory decrement
      await recordOrderEvent({
        orderId: order._id,
        eventType: "PROMOTIONAL_GIFT_DISPATCH",
        source: "SYSTEM",
        metadata: {
          sku: item.sku,
          name: item.name,
          quantity: item.quantity,
          giftReason: "PROMOTIONAL_REWARD",
        },
      });
      continue;
    }
    const pid = item.product?.toString();
    if (!pid) continue;
    productAggregates.set(pid, (productAggregates.get(pid) ?? 0) + item.quantity);
  }

  for (const [pid, qty] of productAggregates.entries()) {
    const product = await Product.findById(pid).session(session).exec();
    if (!product) {
      throw new AppError(404, `Product not found: ${pid}`);
    }

    if (product.inventoryTracked === false || product.isPromotionalGift === true) {
      continue;
    }

    const previousStock = product.stock;
    if (previousStock < qty) {
      throw new AppError(
        400,
        `${product.name} has insufficient stock (${previousStock} available, requested ${qty})`
      );
    }

    const newStock = previousStock - qty;

    // Perform atomic stock decrement
    const result = await Product.updateOne(
      { _id: pid, stock: { $gte: qty } },
      {
        $inc: { stock: -qty, soldCount: qty, trendingScore: qty },
      }
    ).session(session);

    if (!result.modifiedCount) {
      throw new AppError(400, `Stock changed during checkout for ${product.name} — please retry.`);
    }

    // Write to InventoryLedger
    await InventoryLedger.create(
      [
        {
          productId: new mongoose.Types.ObjectId(pid),
          quantity: -qty,
          type: "SALE",
          referenceType: "ORDER",
          referenceId: order._id,
          previousStock,
          newStock,
          createdBy,
        },
      ],
      { session }
    );

    logger.info(`Inventory Sale logged: Product [${pid}] (${previousStock} -> ${newStock})`);
  }
}

/**
 * Restocks returned items to available stock and logs RETURN_RESTOCK.
 */
export async function restockReturnedItems(
  session: mongoose.ClientSession | null,
  returnDoc: any,
  createdBy = "ADMIN"
): Promise<void> {
  for (const item of returnDoc.items) {
    const pid = item.product.toString();
    const qty = item.quantity;

    const product = await Product.findById(pid).session(session).exec();
    if (!product) {
      throw new AppError(404, `Product not found for restocking: ${pid}`);
    }

    const previousStock = product.stock;
    const newStock = previousStock + qty;

    // Increment stock
    await Product.updateOne(
      { _id: pid },
      {
        $inc: { stock: qty },
      }
    ).session(session);

    // Write to ledger
    await InventoryLedger.create(
      [
        {
          productId: new mongoose.Types.ObjectId(pid),
          quantity: qty,
          type: "RETURN_RESTOCK",
          referenceType: "RETURN",
          referenceId: returnDoc._id,
          previousStock,
          newStock,
          createdBy,
        },
      ],
      { session }
    );

    logger.info(
      `Inventory Return Restock logged: Product [${pid}] (${previousStock} -> ${newStock})`
    );
  }
}

/**
 * Logs return of damaged items (does not increment available stock, but creates audit trail).
 */
export async function recordDamagedReturn(
  session: mongoose.ClientSession | null,
  returnDoc: any,
  createdBy = "ADMIN"
): Promise<void> {
  for (const item of returnDoc.items) {
    const pid = item.product.toString();
    const qty = item.quantity;

    const product = await Product.findById(pid).session(session).exec();
    const previousStock = product ? product.stock : 0;

    // Write RETURN_DAMAGED to ledger (no stock adjustment)
    await InventoryLedger.create(
      [
        {
          productId: new mongoose.Types.ObjectId(pid),
          quantity: qty,
          type: "RETURN_DAMAGED",
          referenceType: "RETURN",
          referenceId: returnDoc._id,
          previousStock,
          newStock: previousStock, // Available stock doesn't change
          createdBy,
        },
      ],
      { session }
    );

    logger.info(
      `Inventory Return Damaged logged: Product [${pid}] (Available stock remains ${previousStock})`
    );
  }
}

/**
 * Restocks items for RTO order cancellation and logs RTO_RESTOCK.
 */
export async function restockRTOItems(
  session: mongoose.ClientSession | null,
  order: any,
  createdBy = "SYSTEM"
): Promise<void> {
  if (!order?.items?.length) return;

  for (const item of order.items) {
    const pid = item.product.toString();
    const qty = item.quantity;

    const product = await Product.findById(pid).session(session).exec();
    if (!product) continue;

    const previousStock = product.stock;
    const newStock = previousStock + qty;

    // Increment stock
    await Product.updateOne(
      { _id: pid },
      {
        $inc: { stock: qty, soldCount: -qty, trendingScore: -qty },
      }
    ).session(session);

    // Write to ledger
    await InventoryLedger.create(
      [
        {
          productId: new mongoose.Types.ObjectId(pid),
          quantity: qty,
          type: "RTO_RESTOCK",
          referenceType: "ORDER",
          referenceId: order._id,
          previousStock,
          newStock,
          createdBy,
        },
      ],
      { session }
    );

    logger.info(`Inventory RTO Restock logged: Product [${pid}] (${previousStock} -> ${newStock})`);
  }
}
