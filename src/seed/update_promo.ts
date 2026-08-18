import mongoose from "mongoose";
import dotenv from "dotenv";

dotenv.config({ path: "./src/.env" });
if (!process.env.MONGODB_URI) dotenv.config({ path: "./.env" });

async function run() {
  await mongoose.connect(process.env.MONGODB_URI || "mongodb://localhost:27017/amayra");
  const res = await mongoose.connection
    .db!.collection("promotionalbanners")
    .updateMany(
      { name: "temple bridal set" },
      { $set: { startDate: null, endDate: null, active: true } }
    );
  console.log("Updated promotional banners count:", res.modifiedCount);
  await mongoose.disconnect();
}

void run();
