import "dotenv/config";
import mongoose from "mongoose";
import { connectDatabase } from "../config/database.js";
import { Product } from "../modules/product/model.js";
import { Category } from "../modules/category/model.js";
import { logger } from "../config/logger.js";

export async function seedPromotionalGift(): Promise<any> {
  // Ensure a category exists for the promotional product
  let category = await Category.findOne({ slug: "promotions" });
  if (!category) {
    category = await Category.findOne({});
  }
  if (!category) {
    category = await Category.create({
      name: "Promotions",
      slug: "promotions",
      description: "Promotional items and gifts",
      active: true,
    });
  }

  const giftData = {
    name: "Promotional Free Gift (Worth ₹799)",
    slug: "free-gift-worth-799",
    sku: "GIFT799",
    category: category._id,
    price: 799,
    salePrice: 0,
    stock: 0,
    reservedStock: 0,
    inventoryTracked: false,
    isPromotionalGift: true,
    status: "published",
    images: ["/images/gift-box.webp"],
    shortDescription: "Complimentary luxury gift box for high-value orders.",
    description:
      "Exclusive complimentary jewellery gift automatically unlocked on qualifying orders.",
  };

  const result = await Product.findOneAndUpdate(
    { sku: "GIFT799" },
    { $set: giftData },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );

  logger.info(
    `Promotional Free Gift seeded successfully: ID [${result?._id}] SKU [${result?.sku}]`
  );
  return result;
}

// Standalone execution if called directly
if (import.meta.url === `file://${process.argv[1]?.replace(/\\/g, "/")}`) {
  connectDatabase()
    .then(() => seedPromotionalGift())
    .then(() => mongoose.disconnect())
    .then(() => {
      logger.info("Seed process completed.");
      process.exit(0);
    })
    .catch((err) => {
      logger.error({ err }, "Seed process failed.");
      process.exit(1);
    });
}
