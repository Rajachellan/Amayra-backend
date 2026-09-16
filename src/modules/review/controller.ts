import type { Request, Response, NextFunction } from "express";
import mongoose from "mongoose";
import { Review } from "../../models/Review.js";
import { Product } from "../../models/Product.js";
import { AppError } from "../../utils/AppError.js";

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Curated seed reviews matching the authentic jewellery customer reviews from the reference design
const DEFAULT_SEED_REVIEWS = [
  {
    rating: 5,
    title: "Quality Product",
    comment:
      "Looks good, it gives traditional south indian feel. Very happy with the detailing and finish!",
    reviewerName: "Aarti Khanduri",
    reviewerEmail: "aarti.khanduri@example.com",
    isAnonymous: false,
    verified: true,
    createdAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
  },
  {
    rating: 5,
    title: "Bahut hi yunic design",
    comment:
      "Bahut sundar necklace set hai. The craftmanship and shine are amazing. Loved wearing it for festive occasion.",
    reviewerName: "Diya",
    reviewerEmail: "diya.sharma@example.com",
    isAnonymous: false,
    verified: true,
    createdAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000),
  },
  {
    rating: 5,
    title: "Stunning piece for bridal and wedding wear",
    comment:
      "Superb quality Kundan stones and beads. Got so many compliments during the family reception!",
    reviewerName: "Krishan agrawal",
    reviewerEmail: "krishan.agrawal@example.com",
    isAnonymous: false,
    verified: true,
    createdAt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
  },
  {
    rating: 4,
    title: "Nice and lightweight",
    comment:
      "Very comfortable to wear for long hours. The polish and matching earrings look royal.",
    reviewerName: "Meenakshi Rana",
    reviewerEmail: "meenakshi.rana@example.com",
    isAnonymous: false,
    verified: true,
    createdAt: new Date(Date.now() - 12 * 24 * 60 * 60 * 1000),
  },
  {
    rating: 5,
    title: "Exceeded my expectations",
    comment:
      "Packaged securely in luxury box and delivered quickly. Exactly like shown in pictures!",
    reviewerName: "Ananya Roy",
    reviewerEmail: "ananya.roy@example.com",
    isAnonymous: false,
    verified: true,
    createdAt: new Date(Date.now() - 15 * 24 * 60 * 60 * 1000),
  },
];

export async function listProductReviews(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const idOrSlug = String(req.params.idOrSlug || "")
      .trim()
      .toLowerCase();
    if (!idOrSlug) throw new AppError(400, "Product identifier is required");

    let product = null;
    if (mongoose.isValidObjectId(idOrSlug)) {
      product = await Product.findById(idOrSlug).select("_id slug name images").lean();
    }
    if (!product) {
      product = await Product.findOne({ slug: idOrSlug }).select("_id slug name images").lean();
    }

    const querySlug = product?.slug || idOrSlug;
    const filter: Record<string, unknown> = {
      productSlug: querySlug,
      status: "approved",
    };

    const userReviews: any[] = await Review.find(filter).sort({ createdAt: -1 }).lean();

    // The 5 default reviews are always preserved and appended after newly posted reviews
    const defaultReviews = DEFAULT_SEED_REVIEWS.map((r, i) => ({
      _id: new mongoose.Types.ObjectId().toString(),
      product: product?._id,
      productSlug: querySlug,
      ...r,
      status: "approved" as const,
      createdAt: r.createdAt,
      updatedAt: r.createdAt,
    }));

    const allReviews = [...userReviews, ...defaultReviews];
    const total = allReviews.length;
    const sumRatings = allReviews.reduce((acc, curr) => acc + (curr.rating || 5), 0);
    const averageRating = total > 0 ? Number((sumRatings / total).toFixed(1)) : 5.0;

    res.set("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
    res.json({
      items: allReviews,
      total,
      averageRating,
    });
  } catch (e) {
    next(e);
  }
}

export async function createReview(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const body = req.body as Record<string, unknown>;
    const rating = Math.max(1, Math.min(5, Number(body.rating) || 5));
    const title = String(body.title || "").trim();
    const comment = String(body.comment || "").trim();
    const reviewerName = String(body.reviewerName || "").trim();
    const reviewerEmail = String(body.reviewerEmail || "")
      .trim()
      .toLowerCase();
    const isAnonymous = Boolean(body.isAnonymous);
    const productSlug = String(body.productSlug || "")
      .trim()
      .toLowerCase();
    const productId = body.productId ? String(body.productId) : undefined;

    if (!title || !comment) {
      throw new AppError(400, "Review title and content are required");
    }
    if (!reviewerName) {
      throw new AppError(400, "Display name is required");
    }
    if (!reviewerEmail || !EMAIL_REGEX.test(reviewerEmail)) {
      throw new AppError(400, "A valid email address is required");
    }
    if (!productSlug) {
      throw new AppError(400, "Product slug is required");
    }

    let pDoc = null;
    if (productId && mongoose.isValidObjectId(productId)) {
      pDoc = await Product.findById(productId);
    }
    if (!pDoc) {
      pDoc = await Product.findOne({ slug: productSlug });
    }

    const doc = await Review.create({
      product: pDoc?._id,
      productSlug,
      rating,
      title,
      comment,
      reviewerName: isAnonymous ? "Anonymous" : reviewerName,
      reviewerEmail,
      isAnonymous,
      verified: true,
      status: "pending",
    });

    res.status(201).json({
      ok: true,
      review: doc,
      message: "Review submitted successfully and is pending approval",
    });
  } catch (e) {
    next(e);
  }
}

export async function updateReviewStatusAdmin(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const id = String(req.params.id || "").trim();
    const { status } = req.body as { status?: string };
    if (!status || !["approved", "pending", "rejected"].includes(status)) {
      throw new AppError(400, "Invalid status. Must be 'approved', 'pending', or 'rejected'");
    }

    const doc = await Review.findByIdAndUpdate(id, { status }, { new: true }).populate(
      "product",
      "name slug images"
    );

    if (!doc) throw new AppError(404, "Review not found");
    res.json({ ok: true, review: doc });
  } catch (e) {
    next(e);
  }
}

export async function listReviewsAdmin(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.max(1, Math.min(100, Number(req.query.limit) || 20));
    const skip = (page - 1) * limit;

    const filter: Record<string, unknown> = {};
    if (typeof req.query.q === "string" && req.query.q.trim()) {
      const term = req.query.q.trim();
      filter.$or = [
        { title: { $regex: term, $options: "i" } },
        { comment: { $regex: term, $options: "i" } },
        { reviewerName: { $regex: term, $options: "i" } },
        { reviewerEmail: { $regex: term, $options: "i" } },
        { productSlug: { $regex: term, $options: "i" } },
      ];
    }
    if (
      typeof req.query.status === "string" &&
      req.query.status.trim() &&
      req.query.status !== "all"
    ) {
      filter.status = req.query.status.trim();
    }

    const [items, total, pendingCount, approvedCount] = await Promise.all([
      Review.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate("product", "name slug images")
        .lean(),
      Review.countDocuments(filter),
      Review.countDocuments({ status: "pending" }),
      Review.countDocuments({ status: "approved" }),
    ]);

    res.set("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
    res.json({
      items,
      total,
      pendingCount,
      approvedCount,
      page,
      pages: Math.ceil(total / limit) || 0,
    });
  } catch (e) {
    next(e);
  }
}

export async function deleteReviewAdmin(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const id = String(req.params.id || "");
    const doc = await Review.findByIdAndDelete(id);
    if (!doc) throw new AppError(404, "Review not found");
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
}
