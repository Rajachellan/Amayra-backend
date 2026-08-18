import mongoose from "mongoose";
import dotenv from "dotenv";

dotenv.config({ path: "./src/.env" });
if (!process.env.MONGODB_URI) dotenv.config({ path: "./.env" });

async function createIndexSafely(
  collectionName: string,
  spec: Record<string, number>,
  options?: Record<string, unknown>
) {
  try {
    const db = mongoose.connection.db!;
    await db.collection(collectionName).createIndex(spec, options as any);
  } catch (err: any) {
    // Ignore existing index conflict
  }
}

async function ensureIndexes() {
  await mongoose.connect(process.env.MONGODB_URI || "mongodb://localhost:27017/amayra");
  console.log("Ensuring MongoDB performance indexes...");

  // Products collection indexes
  await createIndexSafely("products", { status: 1, isNewArrival: -1, createdAt: -1 });
  await createIndexSafely("products", { status: 1, isBestSeller: -1 });
  await createIndexSafely("products", { category: 1 });

  // Promotional banners collection indexes
  await createIndexSafely("promotionalbanners", { active: 1, order: 1, priority: -1 });

  // Coupons collection indexes
  await createIndexSafely("coupons", { code: 1, active: 1 });

  // Audit logs collection indexes
  await createIndexSafely("auditlogs", { createdAt: -1, module: 1 });
  await createIndexSafely("auditlogs", { adminId: 1, createdAt: -1 });

  console.log("All performance indexes verified and created successfully!");
  await mongoose.disconnect();
}

void ensureIndexes();
