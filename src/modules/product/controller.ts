import type { Request, Response, NextFunction } from "express";
import mongoose from "mongoose";
import { Product } from "../../models/Product.js";
import { Collection } from "../../models/Collection.js";
import { AppError } from "../../utils/AppError.js";
import { toSlug } from "../../utils/slug.js";
import {
  resolveCategoryIdBySlug,
  resolveCategoryIdsIncludingDescendants,
} from "../../services/categoryService.js";
import { resolveOccasionIdBySlug } from "../../services/occasionService.js";

import { Occasion } from "../../models/Occasion.js";

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
      collections,
      occasion,
      occasions,
      featured,
      trending,
      masterpiece,
      q,
      color,
      colors,
      minPrice,
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
      const cids = await resolveCategoryIdsIncludingDescendants(category);
      if (cids.length === 0) {
        res.json({ items: [], total: 0, page: 1, pages: 0 });
        return;
      }
      filter.$or = [{ category: { $in: cids } }, { subCategory: { $in: cids } }];
    }
    if (typeof subCategory === "string" && subCategory && subCategory !== "all") {
      const sid = await resolveCategoryIdBySlug(subCategory);
      if (sid) filter.subCategory = sid;
    }
    if (typeof section === "string" && section) {
      filter.sections = section;
    }

    const rawCollections = collections || collection;
    if (rawCollections) {
      const colSlugs = (
        Array.isArray(rawCollections) ? rawCollections.join(",") : String(rawCollections)
      )
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      if (colSlugs.length > 0) {
        const foundCols = await Collection.find({ slug: { $in: colSlugs }, active: true }).select(
          "_id"
        );
        if (foundCols.length === 0) {
          res.json({ items: [], total: 0, page: 1, pages: 0 });
          return;
        }
        filter.collections = { $in: foundCols.map((c) => c._id) };
      }
    }

    const rawOccasions = occasions || occasion;
    if (rawOccasions) {
      const occSlugs = (Array.isArray(rawOccasions) ? rawOccasions.join(",") : String(rawOccasions))
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      if (occSlugs.length > 0) {
        const foundOccs = await Occasion.find({ slug: { $in: occSlugs }, active: true }).select(
          "_id"
        );
        if (foundOccs.length === 0) {
          res.json({ items: [], total: 0, page: 1, pages: 0 });
          return;
        }
        filter.occasions = { $in: foundOccs.map((o) => o._id) };
      }
    }

    if (featured === "true") filter.featured = true;
    if (trending === "true") filter.trending = true;
    if (masterpiece === "true") filter.masterpiece = true;
    if (typeof q === "string" && q.trim()) {
      filter.name = { $regex: q.trim(), $options: "i" };
    }

    const rawColors = colors || color;
    if (rawColors) {
      const colorList = (Array.isArray(rawColors) ? rawColors.join(",") : String(rawColors))
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      if (colorList.length > 0) {
        filter.color = {
          $in: colorList.map(
            (c) => new RegExp(`^${c.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i")
          ),
        };
      }
    }

    const minP = minPrice != null && String(minPrice).trim() !== "" ? Number(minPrice) : null;
    const maxP = maxPrice != null && String(maxPrice).trim() !== "" ? Number(maxPrice) : null;
    if (minP != null || maxP != null) {
      const priceFilter: Record<string, number> = {};
      if (minP != null && !Number.isNaN(minP)) priceFilter.$gte = minP;
      if (maxP != null && !Number.isNaN(maxP)) priceFilter.$lte = maxP;
      filter.price = priceFilter;
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
        .select(
          "_id name slug category subCategory collections occasions images price salePrice stock tags featured trending masterpiece newArrival color createdAt sku"
        )
        .sort(sortSpec)
        .skip((p - 1) * l)
        .limit(l)
        .populate("category", "name slug")
        .populate("subCategory", "name slug")
        .populate("collections", "name slug")
        .populate("occasions", "name slug")
        .lean(),
      Product.countDocuments(filter),
    ]);

    res.set("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
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

export async function getProductFacets(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { category, subCategory, section, featured, trending, masterpiece, q } = req.query;

    const baseMatch: Record<string, unknown> = publishedFilter();

    if (typeof category === "string" && category === "new") {
      const since = new Date();
      since.setDate(since.getDate() - 90);
      baseMatch.$or = [{ newArrival: true }, { createdAt: { $gte: since } }];
    } else if (typeof category === "string" && category && category !== "all") {
      const cids = await resolveCategoryIdsIncludingDescendants(category);
      if (cids.length === 0) {
        res.json({
          occasions: [],
          collections: [],
          colors: [],
          priceRange: { min: 0, max: 0, total: 0 },
          priceRanges: [],
        });
        return;
      }
      baseMatch.$or = [{ category: { $in: cids } }, { subCategory: { $in: cids } }];
    }

    if (typeof subCategory === "string" && subCategory && subCategory !== "all") {
      const sid = await resolveCategoryIdBySlug(subCategory);
      if (sid) baseMatch.subCategory = sid;
    }

    if (typeof section === "string" && section) {
      baseMatch.sections = section;
    }

    if (featured === "true") baseMatch.featured = true;
    if (trending === "true") baseMatch.trending = true;
    if (masterpiece === "true") baseMatch.masterpiece = true;

    if (typeof q === "string" && q.trim()) {
      baseMatch.name = { $regex: q.trim(), $options: "i" };
    }

    const buildFacetPipeline = (matchCond: Record<string, unknown>): mongoose.PipelineStage[] => [
      { $match: matchCond },
      {
        $facet: {
          occasions: [
            { $unwind: "$occasions" },
            { $group: { _id: "$occasions", count: { $sum: 1 } } },
          ],
          collections: [
            { $unwind: "$collections" },
            { $group: { _id: "$collections", count: { $sum: 1 } } },
          ],
          colors: [
            { $match: { color: { $exists: true, $ne: null } } },
            {
              $project: {
                trimmedColor: { $trim: { input: "$color" } },
              },
            },
            { $match: { trimmedColor: { $ne: "" } } },
            { $group: { _id: "$trimmedColor", count: { $sum: 1 } } },
            { $sort: { count: -1, _id: 1 } },
          ],
          priceStats: [
            {
              $group: {
                _id: null,
                minPrice: { $min: "$price" },
                maxPrice: { $max: "$price" },
                total: { $sum: 1 },
              },
            },
          ],
          priceBuckets: [
            {
              $bucket: {
                groupBy: "$price",
                boundaries: [0, 5000, 10000, 20000, 10000000],
                default: "other",
                output: { count: { $sum: 1 } },
              },
            },
          ],
        },
      },
    ];

    let [facetResult] = await Product.aggregate(buildFacetPipeline(baseMatch));
    let effectiveMatch = baseMatch;

    // If current category has 0 items, fallback to entire published catalog
    if (!facetResult?.priceStats?.[0]?.total || facetResult.priceStats[0].total === 0) {
      effectiveMatch = publishedFilter();
      const [fallbackResult] = await Product.aggregate(buildFacetPipeline(effectiveMatch));
      if (fallbackResult && fallbackResult.priceStats?.[0]?.total) {
        facetResult = fallbackResult;
      }
    }

    // Map occasion counts
    const occMap = new Map<string, number>();
    for (const item of facetResult?.occasions || []) {
      occMap.set(String(item._id), item.count);
    }
    const allOccasions = await Occasion.find({ active: true }).sort({ order: 1, name: 1 }).lean();
    const occasions = allOccasions.map((o) => ({
      _id: String(o._id),
      name: o.name,
      slug: o.slug,
      count: occMap.get(String(o._id)) || 0,
    }));

    // Map collection counts
    const colMap = new Map<string, number>();
    for (const item of facetResult?.collections || []) {
      colMap.set(String(item._id), item.count);
    }
    const allCollections = await Collection.find({ active: true })
      .sort({ order: 1, name: 1 })
      .lean();
    const collections = allCollections.map((c) => ({
      _id: String(c._id),
      name: c.name,
      slug: c.slug,
      count: colMap.get(String(c._id)) || 0,
    }));

    // Map colors (standard finishes Gold, Silver, Rose Gold, Antique)
    const STANDARD_FINISHES = ["Gold", "Silver", "Rose Gold", "Antique"];
    const finishCounts = await Promise.all(
      STANDARD_FINISHES.map(async (f) => {
        const cnt = await Product.countDocuments({
          ...effectiveMatch,
          $or: [
            { color: { $regex: f, $options: "i" } },
            { "specifications.color": { $regex: f, $options: "i" } },
            { tags: { $regex: f, $options: "i" } },
            { name: { $regex: f, $options: "i" } },
          ],
        });
        return { name: f, count: cnt };
      })
    );

    // Price stats & buckets
    const pStats = facetResult?.priceStats?.[0] || { minPrice: 0, maxPrice: 0, total: 0 };
    const bucketCounts: Record<string | number, number> = {};
    for (const b of facetResult?.priceBuckets || []) {
      bucketCounts[b._id] = b.count;
    }

    const priceRanges = [
      { label: "Under ₹5,000", min: 0, max: 5000, count: bucketCounts[0] || 0 },
      { label: "₹5,000 - ₹10,000", min: 5000, max: 10000, count: bucketCounts[5000] || 0 },
      { label: "₹10,000 - ₹20,000", min: 10000, max: 20000, count: bucketCounts[10000] || 0 },
      { label: "Over ₹20,000", min: 20000, max: 10000000, count: bucketCounts[20000] || 0 },
    ];

    res.set("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
    res.json({
      occasions,
      collections,
      colors: finishCounts,
      priceRange: {
        min: pStats.minPrice ?? 0,
        max: pStats.maxPrice ?? 0,
        total: pStats.total ?? 0,
      },
      priceRanges,
    });
  } catch (e) {
    next(e);
  }
}

export async function validateCartBatch(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { items } = req.body as { items: Array<{ id?: string; slug?: string }> };
    if (!Array.isArray(items) || items.length === 0) {
      res.json([]);
      return;
    }
    const slugs = items.map((i) => i.slug).filter(Boolean) as string[];
    const ids = items
      .map((i) => i.id)
      .filter((id) => id && mongoose.isValidObjectId(id)) as string[];

    const docs = await Product.find({
      $or: [{ slug: { $in: slugs } }, { _id: { $in: ids } }],
    })
      .select("_id slug name price salePrice stock status")
      .lean();

    const result = items.map((item) => {
      const match = docs.find((d) => d.slug === item.slug || String(d._id) === item.id);
      if (!match) return { id: item.id, slug: item.slug, stock: 0, price: 0, valid: false };
      const effectivePrice = Math.round(
        match.salePrice != null && match.salePrice < match.price ? match.salePrice : match.price
      );
      return {
        id: String(match._id),
        slug: match.slug,
        stock: match.stock ?? 0,
        price: effectivePrice,
        status: match.status,
        valid: match.status === "published" && (match.stock ?? 0) > 0,
      };
    });

    res.json(result);
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

async function findProductDoc(idOrSlug: string) {
  if (mongoose.isValidObjectId(idOrSlug)) {
    const doc = await Product.findById(idOrSlug);
    if (doc) return doc;
  }
  return Product.findOne({ slug: idOrSlug.toLowerCase() });
}

export async function getProductByIdAdmin(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const id = String(req.params.id || "");
    let doc = null;
    if (mongoose.isValidObjectId(id)) {
      doc = await Product.findById(id)
        .populate("category", "name slug")
        .populate("subCategory", "name slug")
        .populate("collections", "name slug")
        .populate("occasions", "name slug")
        .populate("lookbooks", "title slug images coverImage");
    }
    if (!doc) {
      doc = await Product.findOne({ slug: id.toLowerCase() })
        .populate("category", "name slug")
        .populate("subCategory", "name slug")
        .populate("collections", "name slug")
        .populate("occasions", "name slug")
        .populate("lookbooks", "title slug images coverImage");
    }
    if (!doc) throw new AppError(404, "Product not found");
    res.set("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
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
    const slug = String(req.params.slug || "");
    const queryFilter = mongoose.isValidObjectId(slug)
      ? { $or: [{ slug }, { _id: slug }] }
      : { slug };
    const doc = await Product.findOne(publishedFilter(queryFilter))
      .populate("category", "name slug")
      .populate("subCategory", "name slug")
      .populate("collections", "name slug image")
      .populate("occasions", "name slug image")
      .populate("lookbooks", "title slug coverImage images");
    if (!doc) throw new AppError(404, "Product not found");
    res.set("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
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
    const id = String(req.params.id || "");
    const target = await findProductDoc(id);
    if (!target) throw new AppError(404, "Product not found");
    const doc = await Product.findByIdAndUpdate(target._id, req.body, { new: true });
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
    const id = String(req.params.id || "");
    const target = await findProductDoc(id);
    if (!target) throw new AppError(404, "Product not found");
    await Product.findByIdAndDelete(target._id);
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
}
