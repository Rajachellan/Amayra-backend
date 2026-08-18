import type { Request, Response, NextFunction } from "express";
import { calculateCartPricing } from "./pricing.service.js";
import { getOrCreatePricingSettings, PricingSettings } from "./pricing.model.js";
import { logAdminAction } from "../audit/audit.service.js";

export async function calculateCart(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { items, couponCode } = req.body as {
      items?: Array<{ productId?: string; slug?: string; quantity: number }>;
      couponCode?: string;
    };
    const customerId = (req as Request & { customerId?: string }).customerId;

    const pricing = await calculateCartPricing({
      items: items || [],
      couponCode,
      userId: customerId,
    });

    res.json(pricing);
  } catch (e) {
    next(e);
  }
}

export async function getPricingSettingsAdmin(
  _req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const settings = await getOrCreatePricingSettings();
    res.json(settings);
  } catch (e) {
    next(e);
  }
}

export async function updatePricingSettingsAdmin(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { discountSlabs, allowCouponWithSlabDiscount, defaultGstRate } = req.body as {
      discountSlabs?: Array<{ minimumCartValue: number; discountPercentage: number }>;
      allowCouponWithSlabDiscount?: boolean;
      defaultGstRate?: number;
    };

    const doc = await getOrCreatePricingSettings();

    if (Array.isArray(discountSlabs)) {
      doc.discountSlabs = discountSlabs.map((s) => ({
        minimumCartValue: Number(s.minimumCartValue) || 0,
        discountPercentage: Number(s.discountPercentage) || 0,
      })) as any;
    }

    if (allowCouponWithSlabDiscount !== undefined) {
      doc.allowCouponWithSlabDiscount = Boolean(allowCouponWithSlabDiscount);
    }

    if (defaultGstRate !== undefined) {
      doc.defaultGstRate = Number(defaultGstRate) || 3;
    }

    await doc.save();

    await logAdminAction(req, {
      action: "PRICING_SETTINGS_UPDATE",
      module: "pricing",
      description: "Updated discount slabs and pricing settings",
      details: {
        discountSlabs: doc.discountSlabs,
        allowCouponWithSlabDiscount: doc.allowCouponWithSlabDiscount,
        defaultGstRate: doc.defaultGstRate,
      },
    });

    res.json(doc);
  } catch (e) {
    next(e);
  }
}
