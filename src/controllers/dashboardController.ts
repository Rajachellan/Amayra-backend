import type { Request, Response, NextFunction } from "express";
import { Product } from "../models/Product.js";
import { Category } from "../models/Category.js";
import { Lead } from "../models/Lead.js";
import { Blog } from "../models/Blog.js";

export async function getDashboardStats(_req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const [products, categories, leads, blogs, recentLeads, recentProducts] = await Promise.all([
      Product.countDocuments(),
      Category.countDocuments(),
      Lead.countDocuments(),
      Blog.countDocuments(),
      Lead.find().sort({ createdAt: -1 }).limit(5),
      Product.find().sort({ createdAt: -1 }).limit(5),
    ]);

    res.json({
      products,
      categories,
      leads,
      blogs,
      recentLeads,
      recentProducts,
    });
  } catch (e) {
    next(e);
  }
}
