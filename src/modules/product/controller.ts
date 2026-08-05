import type { Request, Response, NextFunction } from "express";
import mongoose from "mongoose";
import { Product } from "../../models/Product.js";
import { Collection } from "../../models/Collection.js";
import { AppError } from "../../utils/AppError.js";
import { toSlug } from "../../utils/slug.js";
import { resolveCategoryIdBySlug } from "../../services/categoryService.js";
import { resolveOccasionIdBySlug } from "../../services/occasionService.js";

function publishedFilter(extra: Record<string, unknown> = {}) {
  // stock: { $gt: 0 } hides out-of-stock products from all public storefront queries
  return { status: { $in: ["published", null] }, stock: { $gt: 0 }, ...extra };
}

export async function createProduct(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const body = req.body as Record<string, unknown>;
    const name = String(body.name ?? "");
    if (!name) throw new AppError(400, "name is required");
    const slug = body.slug ? String(body.slug) : toSlug(name);
    if (await Product.findOne({ slug })) throw new AppError(409, "slug already exists");
    const doc = await Product.create({
      ...body,
      name,
      slug,
    });
    res.status(201).json(doc);
  } catch (e) {
    next(e);
  }
}

export async function listProducts(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const {
      category,
      subCategory,
      section,
      collection,
      occasion,
      featured,
      trending,
      masterpiece,
      q,
      color,
      maxPrice,
      page = "1",
      limit = "24",
      sort,
    } = req.query;

    const filter: Record<string, unknown> = publishedFilter();

    if (typeof category === "string" && category === "new") {
      const since = new Date();
      since.setDate(since.getDate() - 90);
      filter.$or = [{ newArrival: true }, { createdAt: { $gte: since } }];
    } else if (typeof category === "string" && category && category !== "all") {
      const cid = await resolveCategoryIdBySlug(category);
      if (!cid) {
        res.json({ items: [], total: 0, page: 1, pages: 0 });
        return;
      }
      filter.category = cid;
    }
    if (typeof subCategory === "string" && subCategory && subCategory !== "all") {
      const sid = await resolveCategoryIdBySlug(subCategory);
      if (sid) filter.subCategory = sid;
    }
    if (typeof section === "string" && section) {
      filter.sections = section;
    }
    if (typeof collection === "string" && collection.trim()) {
      const col = await Collection.findOne({ slug: collection.trim(), active: true }).select("_id");
      if (!col) {
        res.json({ items: [], total: 0, page: 1, pages: 0 });
        return;
      }
      filter.collections = col._id;
    }
    if (typeof occasion === "string" && occasion.trim()) {
      const oid = await resolveOccasionIdBySlug(occasion.trim());
      if (!oid) {
        res.json({ items: [], total: 0, page: 1, pages: 0 });
        return;
      }
      filter.occasions = oid;
    }
    if (featured === "true") filter.featured = true;
    if (trending === "true") filter.trending = true;
    if (masterpiece === "true") filter.masterpiece = true;
    if (typeof q === "string" && q.trim()) {
      filter.name = { $regex: q.trim(), $options: "i" };
    }
    if (typeof color === "string" && color.trim()) {
      filter.color = {
        $regex: new RegExp(`^${color.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i"),
      };
    }
    if (maxPrice != null && String(maxPrice).trim() !== "") {
      const mp = Number(maxPrice);
      if (!Number.isNaN(mp)) {
        filter.price = { $lte: mp };
      }
    }

    const p = Math.max(1, parseInt(String(page), 10) || 1);
    const l = Math.min(100, Math.max(1, parseInt(String(limit), 10) || 24));
    let sortSpec: Record<string, 1 | -1> = { createdAt: -1 };
    if (sort === "trending") sortSpec = { trendingScore: -1, createdAt: -1 };
    else if (sort === "bestseller") sortSpec = { soldCount: -1, createdAt: -1 };
    else if (sort === "price_asc") sortSpec = { price: 1 };
    else if (sort === "price_desc") sortSpec = { price: -1 };

    const [items, total] = await Promise.all([
      Product.find(filter)
        .sort(sortSpec)
        .skip((p - 1) * l)
        .limit(l)
        .populate("category", "name slug")
        .populate("subCategory", "name slug")
        .lean(),
      Product.countDocuments(filter),
    ]);

    res.json({
      items,
      total,
      page: p,
      pages: Math.ceil(total / l) || 0,
    });
  } catch (e) {
    next(e);
  }
}

/** Admin: paginated list, any status */
export async function listProductsAdmin(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { page = "1", limit = "24", status, q } = req.query;
    const filter: Record<string, unknown> = {};
    if (typeof status === "string" && status.trim()) {
      filter.status = status.trim();
    }
    if (typeof q === "string" && q.trim()) {
      const term = q.trim();
      filter.$or = [
        { name: { $regex: term, $options: "i" } },
        { slug: { $regex: term, $options: "i" } },
        { sku: { $regex: term, $options: "i" } },
        { tags: { $regex: term, $options: "i" } },
      ];
    }
    const p = Math.max(1, parseInt(String(page), 10) || 1);
    const l = Math.min(100, Math.max(1, parseInt(String(limit), 10) || 24));
    const [items, total] = await Promise.all([
      Product.find(filter)
        .sort({ updatedAt: -1 })
        .skip((p - 1) * l)
        .limit(l)
        .populate("category", "name slug")
        .populate("subCategory", "name slug")
        .lean(),
      Product.countDocuments(filter),
    ]);
    res.json({ items, total, page: p, pages: Math.ceil(total / l) || 0 });
  } catch (e) {
    next(e);
  }
}

export async function getProductByIdAdmin(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { id } = req.params;
    if (!mongoose.isValidObjectId(id)) throw new AppError(400, "Invalid id");
    const doc = await Product.findById(id)
      .populate("category", "name slug")
      .populate("subCategory", "name slug")
      .populate("collections", "name slug")
      .populate("occasions", "name slug")
      .populate("lookbooks", "title slug images coverImage");
    if (!doc) throw new AppError(404, "Product not found");
    res.json(doc);
  } catch (e) {
    next(e);
  }
}

export async function getProductBySlug(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { slug } = req.params;
    const doc = await Product.findOne(publishedFilter({ slug }))
      .populate("category", "name slug")
      .populate("subCategory", "name slug")
      .populate("collections", "name slug image")
      .populate("occasions", "name slug image")
      .populate("lookbooks", "title slug coverImage images");
    if (!doc) throw new AppError(404, "Product not found");
    res.json(doc);
  } catch (e) {
    next(e);
  }
}

export async function updateProduct(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { id } = req.params;
    const doc = await Product.findByIdAndUpdate(id, req.body, { new: true });
    if (!doc) throw new AppError(404, "Product not found");
    res.json(doc);
  } catch (e) {
    next(e);
  }
}

export async function deleteProduct(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { id } = req.params;
    if (!mongoose.isValidObjectId(id)) throw new AppError(400, "Invalid id");
    const doc = await Product.findByIdAndDelete(id);
    if (!doc) throw new AppError(404, "Product not found");
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
}
