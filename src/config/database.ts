import dns from "node:dns";
import mongoose from "mongoose";
import { env } from "./env.js";
import { logger } from "./logger.js";

export async function connectDatabase(uri = env.MONGODB_URI): Promise<typeof mongoose> {
  // Node on Windows often fails mongodb+srv SRV lookups — use public resolvers as fallback.
  if (uri.startsWith("mongodb+srv://")) {
    dns.setServers(["8.8.8.8", "8.8.4.4", "1.1.1.1"]);
  }

  mongoose.set("strictQuery", true);
  await mongoose.connect(uri);
  logger.info("MongoDB connected");
  return mongoose;
}

export async function disconnectDatabase(): Promise<void> {
  await mongoose.disconnect();
  logger.info("MongoDB disconnected");
}

/** @deprecated Use connectDatabase — kept for legacy imports */
export async function connectDb(uri: string): Promise<void> {
  await connectDatabase(uri);
}
