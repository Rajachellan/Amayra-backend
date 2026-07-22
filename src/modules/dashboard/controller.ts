import type { Request, Response, NextFunction } from "express";
import { Product } from '../../models/Product.js';
import { Category } from '../../models/Category.js';
import { Lead } from '../../models/Lead.js';
import { Blog } from '../../models/Blog.js';
import { Order } from '../../models/Order.js';
import { Payment } from '../../models/Payment.js';
import { orderListVisibilityFilter } from '../../utils/orderListVisibility.js';

export async function getDashboardStats(_req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const [
      products,
      categories,
      leads,
      blogs,
      orders,
      payments,
      recentLeads,
      recentProducts,
      recentOrders,
      recentPayments,
    ] = await Promise.all([
      Product.countDocuments(),
      Category.countDocuments(),
      Lead.countDocuments(),
      Blog.countDocuments(),
      Order.countDocuments(),
      Payment.countDocuments(),
      Lead.find().sort({ createdAt: -1 }).limit(5),
      Product.find().sort({ createdAt: -1 }).limit(5),
      Order.find(orderListVisibilityFilter())
        .sort({ createdAt: -1 })
        .limit(5)
        .populate("customer", "name email"),
      Payment.find({ status: "captured" })
        .sort({ createdAt: -1 })
        .limit(5)
        .populate("order", "orderNumber"),
    ]);

    res.json({
      products,
      categories,
      leads,
      blogs,
      orders,
      payments,
      recentLeads,
      recentProducts,
      recentOrders,
      recentPayments,
    });
  } catch (e) {
    next(e);
  }
}
