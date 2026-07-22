import type { Request, Response, NextFunction } from "express";
import { Payment } from '../../models/Payment.js';
import { PAYMENT_STATUSES } from '../../models/Payment.js';
import { AppError } from '../../utils/AppError.js';

export async function listPaymentsAdmin(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.max(1, Math.min(50, Number(req.query.limit) || 20));
    const skip = (page - 1) * limit;
    const filter: Record<string, unknown> = {};
    if (
      req.query.status &&
      PAYMENT_STATUSES.includes(req.query.status as (typeof PAYMENT_STATUSES)[number])
    ) {
      filter.status = req.query.status;
    }

    const [items, total] = await Promise.all([
      Payment.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate("customer", "name email")
        .populate("order", "orderNumber status total")
        .lean(),
      Payment.countDocuments(filter),
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

export async function getPaymentAdmin(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { id } = req.params;
    const payment = await Payment.findById(id)
      .populate("customer", "name email phone")
      .populate("order")
      .lean();
    if (!payment) throw new AppError(404, "Payment not found");
    res.json(payment);
  } catch (e) {
    next(e);
  }
}
