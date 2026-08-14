import type { Request, Response, NextFunction } from "express";
import { InventoryLedger } from "./model.js";
import { Product } from "../../models/Product.js";
import { AppError } from "../../utils/AppError.js";

/**
 * Retrieve inventory ledger history for auditing.
 */
export async function getInventoryLedger(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const adminId = (req as any).adminId;
    if (!adminId) throw new AppError(401, "Unauthorized");

    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.max(1, Math.min(100, Number(req.query.limit) || 20));
    const skip = (page - 1) * limit;

    const [items, total] = await Promise.all([
      InventoryLedger.find({})
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate("productId", "name sku price"),
      InventoryLedger.countDocuments({}),
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

/**
 * Retrieve current product stock status including variants.
 */
export async function getInventoryStockStatus(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const adminId = (req as any).adminId;
    if (!adminId) throw new AppError(401, "Unauthorized");

    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.max(1, Math.min(100, Number(req.query.limit) || 20));
    const skip = (page - 1) * limit;

    const [items, total] = await Promise.all([
      Product.find({})
        .sort({ stock: 1 })
        .skip(skip)
        .limit(limit)
        .select("name sku price stock variants status"),
      Product.countDocuments({}),
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
