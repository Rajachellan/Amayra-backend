import mongoose from "mongoose";
import { Product } from "../../models/Product.js";
import { Coupon } from "../coupon/coupon.model.js";
import { PromotionalBanner } from "../banner/promotional.model.js";
import { getOrCreatePricingSettings } from "./pricing.model.js";
import { AppError } from "../../utils/AppError.js";

export type CartItemInput = {
  productId?: string;
  slug?: string;
  quantity: number;
};

export type PricingResult = {
  subtotal: number;
  automaticDiscount: number;
  couponDiscount: number;
  totalDiscount: number;
  taxableValue: number;
  gstRate: number;
  gstAmount: number;
  finalAmount: number;
  currency: string;
  appliedCoupon: {
    code: string;
    discountType: string;
    discountValue: number;
    discountAmount: number;
  } | null;
  discountSlab: {
    minimumCartValue: number;
    discountPercentage: number;
  };
  upsell: {
    available: boolean;
    nextThreshold?: number;
    currentCartValue?: number;
    amountToUnlock?: number;
    currentDiscountPercentage?: number;
    nextDiscountPercentage?: number;
    currentPayable?: number;
    newPayable?: number;
    additionalPayment?: number;
  };
  items: Array<{
    productId: string;
    name: string;
    slug: string;
    sku?: string;
    unitPrice: number;
    quantity: number;
    lineTotal: number;
    gstRate: number;
    image?: string;
  }>;
};

function round2(val: number): number {
  return Math.round(val * 100) / 100;
}

export async function calculateCartPricing(args: {
  items: CartItemInput[];
  couponCode?: string;
  userId?: string;
  customGstRate?: number;
}): Promise<PricingResult> {
  const settings = await getOrCreatePricingSettings();
  const slabs = [...(settings.discountSlabs || [])].sort(
    (a, b) => a.minimumCartValue - b.minimumCartValue
  );

  if (!args.items || !args.items.length) {
    throw new AppError(400, "Cart is empty");
  }

  // 1. Fetch products & resolve line items
  const productIdsOrSlugs = args.items
    .map((i) => i.productId || i.slug)
    .filter((v): v is string => Boolean(v));

  const objectIds = productIdsOrSlugs.filter((id) => mongoose.Types.ObjectId.isValid(id));

  const products = await Product.find({
    $or: [{ _id: { $in: objectIds } }, { slug: { $in: productIdsOrSlugs } }],
  }).lean();

  const productMap = new Map<string, (typeof products)[0]>();
  for (const p of products) {
    productMap.set(p._id.toString(), p);
    productMap.set(p.slug, p);
  }

  let subtotal = 0;
  let totalWeightedGst = 0;

  const resolvedItems: PricingResult["items"] = [];

  for (const input of args.items) {
    const qty = Math.floor(Number(input.quantity));
    if (qty < 1) continue;

    const key = input.productId || input.slug || "";
    const p = productMap.get(key);
    if (!p) {
      throw new AppError(400, `Product not found: ${key}`);
    }

    const unitPrice = p.salePrice != null && p.salePrice >= 0 ? p.salePrice : p.price;
    if (!(unitPrice >= 0)) {
      throw new AppError(400, `Invalid price for ${p.name}`);
    }

    const lineTotal = round2(unitPrice * qty);
    subtotal += lineTotal;

    const itemGstRate = args.customGstRate ?? (p as any).gstRate ?? settings.defaultGstRate ?? 3;
    totalWeightedGst += itemGstRate * lineTotal;

    resolvedItems.push({
      productId: p._id.toString(),
      name: p.name,
      slug: p.slug,
      sku: p.sku || undefined,
      unitPrice,
      quantity: qty,
      lineTotal,
      gstRate: itemGstRate,
      image: p.images?.[0],
    });
  }

  subtotal = round2(subtotal);
  const effectiveGstRate =
    subtotal > 0 ? round2(totalWeightedGst / subtotal) : (settings.defaultGstRate ?? 3);

  // 2. Determine applicable discount slab
  let activeSlab = { minimumCartValue: 0, discountPercentage: 0 };
  for (const slab of slabs) {
    if (subtotal >= slab.minimumCartValue) {
      activeSlab = slab;
    }
  }

  let automaticDiscount = round2(subtotal * (activeSlab.discountPercentage / 100));

  // 3. Validate & Calculate Coupon Discount
  let couponDiscount = 0;
  let appliedCoupon: PricingResult["appliedCoupon"] = null;

  if (args.couponCode?.trim()) {
    const code = args.couponCode.trim().toUpperCase();
    const now = new Date();

    // Check Coupon collection first
    const couponDoc = await Coupon.findOne({ code, active: true }).lean();

    if (couponDoc) {
      // Validate dates
      if (couponDoc.startDate && new Date(couponDoc.startDate) > now) {
        throw new AppError(400, `Coupon ${code} is not active yet`);
      }
      if (couponDoc.endDate && new Date(couponDoc.endDate) < now) {
        throw new AppError(400, `Coupon ${code} has expired`);
      }
      // Validate usage limit
      if (couponDoc.usageLimit != null && couponDoc.timesUsed >= couponDoc.usageLimit) {
        throw new AppError(400, `Coupon ${code} usage limit reached`);
      }
      // Validate minimum cart value
      if (couponDoc.minCartValue && subtotal < couponDoc.minCartValue) {
        throw new AppError(
          400,
          `Minimum cart value of ₹${couponDoc.minCartValue} required for coupon ${code}`
        );
      }

      // Calculate discount value
      let rawDiscount = 0;
      if (couponDoc.discountType === "percentage") {
        rawDiscount = subtotal * (couponDoc.discountValue / 100);
        if (couponDoc.maxDiscount != null && couponDoc.maxDiscount > 0) {
          rawDiscount = Math.min(rawDiscount, couponDoc.maxDiscount);
        }
      } else {
        rawDiscount = Math.min(couponDoc.discountValue, subtotal);
      }
      couponDiscount = round2(rawDiscount);

      appliedCoupon = {
        code: couponDoc.code,
        discountType: couponDoc.discountType,
        discountValue: couponDoc.discountValue,
        discountAmount: couponDiscount,
      };
    } else if (code === "WELCOME5") {
      couponDiscount = round2(subtotal * 0.05);
      appliedCoupon = {
        code: "WELCOME5",
        discountType: "percentage",
        discountValue: 5,
        discountAmount: couponDiscount,
      };
    } else {
      // Fallback check in PromotionalBanner
      const banner = await PromotionalBanner.findOne({
        couponCode: { $regex: new RegExp(`^${code}$`, "i") },
        active: true,
      }).lean();

      if (banner) {
        let pct = 5;
        const match = code.match(/\d+/);
        if (match) {
          const val = parseInt(match[0], 10);
          if (val > 0 && val <= 100) pct = val;
        }
        couponDiscount = round2(subtotal * (pct / 100));
        appliedCoupon = {
          code: code,
          discountType: "percentage",
          discountValue: pct,
          discountAmount: couponDiscount,
        };
      } else {
        throw new AppError(400, `Invalid or expired coupon code: ${code}`);
      }
    }
  }

  // 4. Stacking Rules Enforcement
  let totalDiscount = 0;
  if (settings.allowCouponWithSlabDiscount) {
    totalDiscount = round2(automaticDiscount + couponDiscount);
  } else {
    // If stacking is disabled, give the customer the higher discount
    if (couponDiscount > automaticDiscount) {
      automaticDiscount = 0;
      totalDiscount = couponDiscount;
    } else {
      couponDiscount = 0;
      appliedCoupon = null;
      totalDiscount = automaticDiscount;
    }
  }

  // 5. Final Payable Amount & GST Extraction
  const finalAmount = Math.max(0, round2(subtotal - totalDiscount));

  // GST Calculation: Taxable Value = Final Amount / (1 + GST/100); GST = Final - Taxable
  const taxableValue = round2(finalAmount / (1 + effectiveGstRate / 100));
  const gstAmount = round2(finalAmount - taxableValue);

  // 6. Dynamic Cart Upsell Calculation
  let upsell: PricingResult["upsell"] = { available: false };

  const nextSlab = slabs.find((s) => s.minimumCartValue > subtotal);
  if (nextSlab) {
    const nextThreshold = nextSlab.minimumCartValue;
    const amountToUnlock = round2(nextThreshold - subtotal);
    const newAutomaticDiscount = round2(nextThreshold * (nextSlab.discountPercentage / 100));

    let newTotalDiscount = 0;
    if (settings.allowCouponWithSlabDiscount) {
      newTotalDiscount = round2(newAutomaticDiscount + couponDiscount);
    } else {
      newTotalDiscount = Math.max(newAutomaticDiscount, couponDiscount);
    }

    const newPayable = Math.max(0, round2(nextThreshold - newTotalDiscount));
    const additionalPayment = round2(newPayable - finalAmount);

    upsell = {
      available: true,
      nextThreshold,
      currentCartValue: subtotal,
      amountToUnlock,
      currentDiscountPercentage: activeSlab.discountPercentage,
      nextDiscountPercentage: nextSlab.discountPercentage,
      currentPayable: finalAmount,
      newPayable,
      additionalPayment,
    };
  }

  return {
    subtotal,
    automaticDiscount,
    couponDiscount,
    totalDiscount,
    taxableValue,
    gstRate: effectiveGstRate,
    gstAmount,
    finalAmount,
    currency: "INR",
    appliedCoupon,
    discountSlab: activeSlab,
    upsell,
    items: resolvedItems,
  };
}
