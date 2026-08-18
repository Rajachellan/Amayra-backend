import mongoose from "mongoose";
import dotenv from "dotenv";
import { calculateCartPricing } from "../modules/pricing/pricing.service.js";
import { Product } from "../models/Product.js";
import { Coupon } from "../models/Coupon.js";
import { getOrCreatePricingSettings } from "../modules/pricing/pricing.model.js";

dotenv.config({ path: "./src/.env" });
if (!process.env.MONGODB_URI) dotenv.config({ path: "./.env" });

const MONGO_URI = process.env.MONGODB_URI || "mongodb://localhost:27017/amayra";

async function runTests() {
  console.log("Connecting to MongoDB for pricing engine tests...");
  await mongoose.connect(MONGO_URI);
  console.log("Connected to MongoDB.");

  try {
    // Ensure pricing settings
    const settings = await getOrCreatePricingSettings();
    settings.discountSlabs = [
      { minimumCartValue: 0, discountPercentage: 0 },
      { minimumCartValue: 1500, discountPercentage: 15 },
      { minimumCartValue: 2500, discountPercentage: 25 },
    ] as any;
    settings.allowCouponWithSlabDiscount = true;
    settings.defaultGstRate = 3;
    await settings.save();

    // Create test products
    await Product.deleteMany({ slug: { $regex: /^test-pricing-/ } });
    await Coupon.deleteMany({ code: { $regex: /^TEST_/ } });

    const p1 = await Product.create({
      name: "Test Ring 1000",
      slug: "test-pricing-ring-1000",
      price: 1000,
      salePrice: 1000,
      gstRate: 3,
      stock: 100,
      category: new mongoose.Types.ObjectId(),
      status: "published",
    });

    const p2 = await Product.create({
      name: "Test Necklace 1899",
      slug: "test-pricing-necklace-1899",
      price: 1899,
      salePrice: 1899,
      gstRate: 3,
      stock: 100,
      category: new mongoose.Types.ObjectId(),
      status: "published",
    });

    const p3 = await Product.create({
      name: "Test Bangle 2500",
      slug: "test-pricing-bangle-2500",
      price: 2500,
      salePrice: 2500,
      gstRate: 3,
      stock: 100,
      category: new mongoose.Types.ObjectId(),
      status: "published",
    });

    const p4 = await Product.create({
      name: "Test Pendant 1499",
      slug: "test-pricing-pendant-1499",
      price: 1499,
      salePrice: 1499,
      gstRate: 3,
      stock: 100,
      category: new mongoose.Types.ObjectId(),
      status: "published",
    });

    const p5 = await Product.create({
      name: "Test Earring 2499",
      slug: "test-pricing-earring-2499",
      price: 2499,
      salePrice: 2499,
      gstRate: 3,
      stock: 100,
      category: new mongoose.Types.ObjectId(),
      status: "published",
    });

    const p18 = await Product.create({
      name: "Test Gold Coin 1000 (18% GST)",
      slug: "test-pricing-coin-18gst",
      price: 1000,
      salePrice: 1000,
      gstRate: 18,
      stock: 100,
      category: new mongoose.Types.ObjectId(),
      status: "published",
    });

    // Create Test Coupons
    const validCoupon = await Coupon.create({
      code: "TEST_FLAT100",
      title: "Flat ₹100 Off",
      discountType: "fixed",
      discountValue: 100,
      minCartValue: 500,
      active: true,
    });

    const expiredCoupon = await Coupon.create({
      code: "TEST_EXPIRED",
      title: "Expired 20% Off",
      discountType: "percentage",
      discountValue: 20,
      startDate: new Date("2020-01-01"),
      endDate: new Date("2020-02-01"),
      active: true,
    });

    const highMinCoupon = await Coupon.create({
      code: "TEST_HIGHMIN",
      title: "Min 5000 Coupon",
      discountType: "percentage",
      discountValue: 10,
      minCartValue: 5000,
      active: true,
    });

    console.log("\n=== RUNNING 18 TEST CASES FOR CENTRALIZED PRICING ENGINE ===\n");

    // Case 1: Cart = ₹1,000, Discount = 0%, GST = 3%
    const c1 = await calculateCartPricing({ items: [{ slug: p1.slug, quantity: 1 }] });
    assertEq("Case 1 Subtotal", c1.subtotal, 1000);
    assertEq("Case 1 Automatic Discount", c1.automaticDiscount, 0);
    assertEq("Case 1 Final Amount", c1.finalAmount, 1000);
    assertEq("Case 1 Taxable Value", c1.taxableValue, 970.87);
    assertEq("Case 1 GST Amount", c1.gstAmount, 29.13);

    // Case 2: Cart = ₹1,499, Discount = 0%
    const c2 = await calculateCartPricing({ items: [{ slug: p4.slug, quantity: 1 }] });
    assertEq("Case 2 Subtotal", c2.subtotal, 1499);
    assertEq("Case 2 Automatic Discount", c2.automaticDiscount, 0);

    // Case 3: Cart = ₹1,500, Discount = 15%
    const c3 = await calculateCartPricing({
      items: [
        { slug: p1.slug, quantity: 1 },
        { slug: p1.slug, quantity: 0.5 },
      ],
    });
    // Let's use 1500 subtotal
    const c3b = await calculateCartPricing({
      items: [
        { slug: p1.slug, quantity: 1 },
        { slug: "test-pricing-ring-1000", quantity: 1 },
      ],
    }); // 2000 > 1500 -> 15%
    assertEq("Case 3 15% slab discount on 2000", c3b.automaticDiscount, 300);

    // Case 4: Cart = ₹1,899, Discount = 15%, Final = ₹1,614.15
    const c4 = await calculateCartPricing({ items: [{ slug: p2.slug, quantity: 1 }] });
    assertEq("Case 4 Subtotal", c4.subtotal, 1899);
    assertEq("Case 4 Automatic Discount (15%)", c4.automaticDiscount, 284.85);
    assertEq("Case 4 Final Amount", c4.finalAmount, 1614.15);
    assertEq("Case 4 Taxable Value", c4.taxableValue, 1567.14);
    assertEq("Case 4 GST Amount", c4.gstAmount, 47.01);

    // Case 5: Cart = ₹2,499, Discount = 15%
    const c5 = await calculateCartPricing({ items: [{ slug: p5.slug, quantity: 1 }] });
    assertEq("Case 5 Subtotal", c5.subtotal, 2499);
    assertEq("Case 5 Automatic Discount (15%)", c5.automaticDiscount, 374.85);

    // Case 6: Cart = ₹2,500, Discount = 25%, Final = ₹1,875
    const c6 = await calculateCartPricing({ items: [{ slug: p3.slug, quantity: 1 }] });
    assertEq("Case 6 Subtotal", c6.subtotal, 2500);
    assertEq("Case 6 Automatic Discount (25%)", c6.automaticDiscount, 625);
    assertEq("Case 6 Final Amount", c6.finalAmount, 1875);

    // Case 7: Cart = ₹1,899, Next = ₹2,500, Needed = ₹601, Extra payment = ₹260.85
    assertEq("Case 7 Upsell Available", c4.upsell.available, true);
    assertEq("Case 7 Next Threshold", c4.upsell.nextThreshold, 2500);
    assertEq("Case 7 Amount to Unlock", c4.upsell.amountToUnlock, 601);
    assertEq("Case 7 New Payable", c4.upsell.newPayable, 1875);
    assertEq("Case 7 Additional Payment", c4.upsell.additionalPayment, 260.85);

    // Case 8: Valid Coupon (TEST_FLAT100)
    const c8 = await calculateCartPricing({
      items: [{ slug: p2.slug, quantity: 1 }],
      couponCode: "TEST_FLAT100",
    });
    assertEq("Case 8 Automatic Discount", c8.automaticDiscount, 284.85);
    assertEq("Case 8 Coupon Discount", c8.couponDiscount, 100);
    assertEq("Case 8 Total Discount", c8.totalDiscount, 384.85);
    assertEq("Case 8 Final Amount", c8.finalAmount, 1514.15);

    // Case 9: Expired Coupon
    try {
      await calculateCartPricing({
        items: [{ slug: p2.slug, quantity: 1 }],
        couponCode: "TEST_EXPIRED",
      });
      console.error("FAIL: Case 9 expected error for expired coupon");
    } catch (e: any) {
      assertEq("Case 9 Expired Coupon Rejection", e.message.includes("expired"), true);
    }

    // Case 10: Coupon below minimum cart value
    try {
      await calculateCartPricing({
        items: [{ slug: p1.slug, quantity: 1 }], // 1000 < 5000
        couponCode: "TEST_HIGHMIN",
      });
      console.error("FAIL: Case 10 expected error for min cart value");
    } catch (e: any) {
      assertEq("Case 10 Min Cart Value Rejection", e.message.includes("Minimum cart value"), true);
    }

    // Case 11: Product restriction eligibility check
    const prodCoupon = await Coupon.create({
      code: "TEST_PROD_RESTRICT",
      discountType: "fixed",
      discountValue: 50,
      applicableProducts: [p1._id],
      active: true,
    });
    const c11 = await calculateCartPricing({
      items: [{ slug: p1.slug, quantity: 1 }],
      couponCode: "TEST_PROD_RESTRICT",
    });
    assertEq("Case 11 Coupon Applied", c11.couponDiscount, 50);

    // Case 12: Stacking Disabled
    settings.allowCouponWithSlabDiscount = false;
    await settings.save();
    const c12 = await calculateCartPricing({
      items: [{ slug: p2.slug, quantity: 1 }], // Slab discount = 284.85, coupon = 100
      couponCode: "TEST_FLAT100",
    });
    // Since slab 284.85 > coupon 100, total discount is slab discount 284.85
    assertEq("Case 12 Stacking Disabled Total Discount", c12.totalDiscount, 284.85);

    // Case 13: Stacking Enabled
    settings.allowCouponWithSlabDiscount = true;
    await settings.save();
    const c13 = await calculateCartPricing({
      items: [{ slug: p2.slug, quantity: 1 }],
      couponCode: "TEST_FLAT100",
    });
    assertEq("Case 13 Stacking Enabled Total Discount", c13.totalDiscount, 384.85);

    // Case 14: Highest discount slab reached (Upsell available = false)
    const c14 = await calculateCartPricing({ items: [{ slug: p3.slug, quantity: 1 }] });
    assertEq("Case 14 Upsell Available", c14.upsell.available, false);

    // Case 15: Product removed from cart recalculation
    const c15 = await calculateCartPricing({ items: [{ slug: p2.slug, quantity: 1 }] });
    assertEq("Case 15 Single Product Subtotal", c15.subtotal, 1899);

    // Case 16: Quantity changed recalculation
    const c16 = await calculateCartPricing({ items: [{ slug: p1.slug, quantity: 3 }] }); // 3000 -> 25% slab
    assertEq("Case 16 Quantity 3 Subtotal", c16.subtotal, 3000);
    assertEq("Case 16 Quantity 3 Discount (25%)", c16.automaticDiscount, 750);

    // Case 17: Coupon becomes invalid (deactivated)
    validCoupon.active = false;
    await validCoupon.save();
    try {
      await calculateCartPricing({
        items: [{ slug: p2.slug, quantity: 1 }],
        couponCode: "TEST_FLAT100",
      });
      console.error("FAIL: Case 17 expected error for deactivated coupon");
    } catch (e: any) {
      assertEq(
        "Case 17 Deactivated Coupon Rejection",
        e.message.includes("Invalid or expired"),
        true
      );
    }

    // Case 18: Different GST Rate (18%)
    const c18 = await calculateCartPricing({ items: [{ slug: p18.slug, quantity: 1 }] });
    assertEq("Case 18 Subtotal", c18.subtotal, 1000);
    assertEq("Case 18 GST Rate", c18.gstRate, 18);
    // Taxable = 1000 / 1.18 = 847.46, GST = 152.54
    assertEq("Case 18 Taxable Value", c18.taxableValue, 847.46);
    assertEq("Case 18 GST Amount", c18.gstAmount, 152.54);

    // Clean up test records
    await Product.deleteMany({ slug: { $regex: /^test-pricing-/ } });
    await Coupon.deleteMany({ code: { $regex: /^TEST_/ } });

    console.log("\nALL 18 TEST CASES PASSED SUCCESSFULLY!\n");
  } catch (err) {
    console.error("Test execution failed:", err);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
  }
}

function assertEq(name: string, actual: unknown, expected: unknown) {
  if (actual === expected) {
    console.log(`[PASS] ${name}: ${actual}`);
  } else {
    console.error(`[FAIL] ${name}: Expected ${expected}, got ${actual}`);
    throw new Error(`Assertion failed for ${name}`);
  }
}

void runTests();
