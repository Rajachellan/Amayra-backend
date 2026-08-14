import mongoose from "mongoose";
import { Product } from "../../models/Product.js";
import { InventoryLedger } from "./model.js";
import { AppError } from "../../utils/AppError.js";
import { logger } from "../../config/logger.js";

/**
 * Decrements stock for products in an order and creates a SALE ledger entry for each.
 */
export async function decrementStockForOrder(
  session: mongoose.ClientSession | null,
  order: any,
  createdBy = "SYSTEM"
): Promise<void> {
  if (!order?.items?.length) return;

  const productAggregates = new Map<string, number>();
  for (const item of order.items) {
    const pid = item.product?.toString();
    if (!pid) continue;
    productAggregates.set(pid, (productAggregates.get(pid) ?? 0) + item.quantity);
  }

  for (const [pid, qty] of productAggregates.entries()) {
    const product = await Product.findById(pid).session(session).exec();
    if (!product) {
      throw new AppError(404, `Product not found: ${pid}`);
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
      throw new AppError(
        400,
        `Stock changed during checkout for ${product.name} — please retry.`
      );
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

    logger.info(
      `Inventory Sale logged: Product [${pid}] (${previousStock} -> ${newStock})`
    );
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

    logger.info(
      `Inventory RTO Restock logged: Product [${pid}] (${previousStock} -> ${newStock})`
    );
  }
}
