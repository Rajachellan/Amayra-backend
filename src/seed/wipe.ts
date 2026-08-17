import "dotenv/config";
import mongoose from "mongoose";
import { connectDb } from "../config/db.js";
import { hashPassword } from "../common/security/password.js";
import { Admin } from "../models/Admin.js";
import { Category } from "../models/Category.js";
import { Collection } from "../models/Collection.js";
import { Occasion } from "../models/Occasion.js";
import { Lookbook } from "../models/Lookbook.js";
import { Banner } from "../models/Banner.js";
import { Product } from "../models/Product.js";
import { HomepageSection } from "../models/HomepageSection.js";
import { Customer } from "../models/Customer.js";
import { Order } from "../models/Order.js";
import { Payment } from "../models/Payment.js";
import { PromotionalBanner } from "../models/PromotionalBanner.js";
import { Blog } from "../models/Blog.js";

const mongoUri = process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/amayra";

export async function wipeCatalogKeepAdmin() {
  await connectDb(mongoUri);
  await Promise.all([
    Product.deleteMany({}),
    Category.deleteMany({}),
    Collection.deleteMany({}),
    Occasion.deleteMany({}),
    Lookbook.deleteMany({}),
    Banner.deleteMany({}),
    PromotionalBanner.deleteMany({}),
    Blog.deleteMany({}),
    HomepageSection.deleteMany({}),
    Payment.deleteMany({}),
    Order.deleteMany({}),
    Customer.deleteMany({}),
  ]);

  const existingAdminCount = await Admin.countDocuments({});
  if (existingAdminCount === 0) {
    const adminPass = process.env.ADMIN_PASSWORD || "changeme";
    await Admin.create({
      email: (process.env.ADMIN_EMAIL || "admin@amayra.local").toLowerCase(),
      passwordHash: await hashPassword(adminPass),
      role: "super_admin",
    });
    console.log("Created default admin:", process.env.ADMIN_EMAIL || "admin@amayra.local");
  }

  console.log(
    "Demo seed data completely wiped. Database is clean and ready for new catalog uploads."
  );
}

if (
  import.meta.url === `file://${process.argv[1]}` ||
  process.argv[1]?.endsWith("wipe.ts") ||
  process.argv[1]?.endsWith("wipe.js")
) {
  wipeCatalogKeepAdmin()
    .then(() => mongoose.disconnect())
    .catch((e) => {
      console.error(e);
      process.exit(1);
    });
}
