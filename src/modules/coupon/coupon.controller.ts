import type { Request, Response, NextFunction } from "express";
import { Coupon } from "./coupon.model.js";
import { AppError } from "../../utils/AppError.js";
import { logAdminAction } from "../audit/audit.service.js";
import { calculateCartPricing } from "../pricing/pricing.service.js";

export async function listCouponsAdmin(
  _req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const list = await Coupon.find().sort({ createdAt: -1 }).lean();
    res.json(list);
  } catch (e) {
    next(e);
  }
}

export async function listPublicCoupons(
  _req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const now = new Date();
    const list = await Coupon.find({
      active: true,
      $and: [
        { $or: [{ startDate: null }, { startDate: { $lte: now } }] },
        { $or: [{ endDate: null }, { endDate: { $gte: now } }] },
      ],
    })
      .sort({ createdAt: -1 })
      .select(
        "code title description discountType discountValue minCartValue maxDiscount usageLimit timesUsed"
      )
      .lean();

    const activeCoupons = list.filter(
      (c) => c.usageLimit == null || (c.timesUsed ?? 0) < c.usageLimit
    );
    res.json(activeCoupons);
  } catch (e) {
    next(e);
  }
}

export async function createCouponAdmin(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const body = req.body as Record<string, unknown>;
    const code = String(body.code || "")
      .trim()
      .toUpperCase();
    if (!code) throw new AppError(400, "Coupon code is required");

    const existing = await Coupon.findOne({ code });
    if (existing) throw new AppError(400, `Coupon code '${code}' already exists`);

    const discountType = body.discountType === "fixed" ? "fixed" : "percentage";
    const discountValue = Number(body.discountValue) || 0;
    if (discountValue <= 0) {
      throw new AppError(400, "Discount value must be greater than 0");
    }
    if (discountType === "percentage" && discountValue > 100) {
      throw new AppError(400, "Percentage discount cannot exceed 100%");
    }

    let startDate: Date | null = null;
    if (body.startDate) {
      const parsed = new Date(String(body.startDate));
      if (!isNaN(parsed.getTime())) startDate = parsed;
    }

    let endDate: Date | null = null;
    if (body.endDate) {
      const str = String(body.endDate);
      const parsed = new Date(str);
      if (!isNaN(parsed.getTime())) {
        endDate = parsed;
        if (/^\d{4}-\d{2}-\d{2}$/.test(str.trim())) {
          endDate.setHours(23, 59, 59, 999);
        }
      }
    }

    if (startDate && endDate && endDate < startDate) {
      throw new AppError(400, "End date (validity) cannot be before start date");
    }

    const coupon = await Coupon.create({
      code,
      title: body.title || "",
      description: body.description || "",
      discountType,
      discountValue,
      minCartValue: Number(body.minCartValue) || 0,
      maxDiscount: body.maxDiscount ? Number(body.maxDiscount) : null,
      startDate,
      endDate,
      usageLimit: body.usageLimit ? Number(body.usageLimit) : null,
      perUserLimit: body.perUserLimit ? Number(body.perUserLimit) : null,
      active: body.active ?? true,
    });

    await logAdminAction(req, {
      action: "COUPON_CREATE",
      module: "coupons",
      description: `Created coupon '${coupon.code}' (${coupon.discountValue}${coupon.discountType === "percentage" ? "%" : " ₹"})`,
      targetId: coupon._id.toString(),
      details: coupon.toObject(),
    });

    res.status(201).json(coupon);
  } catch (e) {
    next(e);
  }
}

export async function updateCouponAdmin(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const body = req.body as Record<string, unknown>;
    const coupon = await Coupon.findById(req.params.id);
    if (!coupon) throw new AppError(404, "Coupon not found");

    if (body.code) coupon.code = String(body.code).trim().toUpperCase();
    if (body.title !== undefined) coupon.title = String(body.title).trim();
    if (body.description !== undefined) coupon.description = String(body.description).trim();

    let newDiscountType = coupon.discountType;
    if (body.discountType !== undefined) {
      newDiscountType = body.discountType === "fixed" ? "fixed" : "percentage";
    }
    let newDiscountValue = coupon.discountValue;
    if (body.discountValue !== undefined) {
      newDiscountValue = Number(body.discountValue) || 0;
    }

    if (newDiscountValue <= 0) {
      throw new AppError(400, "Discount value must be greater than 0");
    }
    if (newDiscountType === "percentage" && newDiscountValue > 100) {
      throw new AppError(400, "Percentage discount cannot exceed 100%");
    }

    let newStartDate = coupon.startDate;
    if (body.startDate !== undefined) {
      if (body.startDate) {
        const parsed = new Date(String(body.startDate));
        newStartDate = !isNaN(parsed.getTime()) ? parsed : null;
      } else {
        newStartDate = null;
      }
    }

    let newEndDate = coupon.endDate;
    if (body.endDate !== undefined) {
      if (body.endDate) {
        const str = String(body.endDate);
        const parsed = new Date(str);
        if (!isNaN(parsed.getTime())) {
          newEndDate = parsed;
          if (/^\d{4}-\d{2}-\d{2}$/.test(str.trim())) {
            newEndDate.setHours(23, 59, 59, 999);
          }
        } else {
          newEndDate = null;
        }
      } else {
        newEndDate = null;
      }
    }

    if (newStartDate && newEndDate && newEndDate < newStartDate) {
      throw new AppError(400, "End date (validity) cannot be before start date");
    }

    coupon.discountType = newDiscountType;
    coupon.discountValue = newDiscountValue;
    coupon.startDate = newStartDate;
    coupon.endDate = newEndDate;
    if (body.minCartValue !== undefined) coupon.minCartValue = Number(body.minCartValue) || 0;
    if (body.maxDiscount !== undefined)
      coupon.maxDiscount = body.maxDiscount ? Number(body.maxDiscount) : null;
    if (body.usageLimit !== undefined)
      coupon.usageLimit = body.usageLimit ? Number(body.usageLimit) : null;
    if (body.perUserLimit !== undefined)
      coupon.perUserLimit = body.perUserLimit ? Number(body.perUserLimit) : null;
    if (body.active !== undefined) coupon.active = Boolean(body.active);

    await coupon.save();

    await logAdminAction(req, {
      action: "COUPON_UPDATE",
      module: "coupons",
      description: `Updated coupon '${coupon.code}'`,
      targetId: coupon._id.toString(),
      details: coupon.toObject(),
    });

    res.json(coupon);
  } catch (e) {
    next(e);
  }
}

export async function deleteCouponAdmin(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const coupon = await Coupon.findByIdAndDelete(req.params.id);
    if (!coupon) throw new AppError(404, "Coupon not found");

    await logAdminAction(req, {
      action: "COUPON_DELETE",
      module: "coupons",
      description: `Deleted coupon '${coupon.code}'`,
      targetId: coupon._id.toString(),
    });

    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
}

export async function validateCoupon(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { couponCode, cartItems } = req.body as {
      couponCode: string;
      cartItems: Array<{ productId?: string; slug?: string; quantity: number }>;
    };

    if (!couponCode?.trim()) throw new AppError(400, "Coupon code is required");
    if (!cartItems?.length) throw new AppError(400, "Cart is empty");

    const pricing = await calculateCartPricing({
      items: cartItems,
      couponCode: couponCode.trim(),
    });

    if (!pricing.appliedCoupon) {
      res.json({
        success: false,
        message: "Coupon is not valid for this cart",
      });
      return;
    }

    res.json({
      success: true,
      couponCode: pricing.appliedCoupon.code,
      discount: pricing.couponDiscount,
      message: "Coupon applied successfully",
      pricing,
    });
  } catch (e) {
    if (e instanceof AppError) {
      res.json({
        success: false,
        message: e.message,
      });
      return;
    }
    next(e);
  }
}
