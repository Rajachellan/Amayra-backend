import dns from "node:dns";
import mongoose from "mongoose";

export async function connectDb(uri: string): Promise<void> {
  // Node on Windows often fails mongodb+srv SRV lookups (querySrv ECONNREFUSED)
  // while system tools like nslookup succeed — use public resolvers as fallback.
  if (uri.startsWith("mongodb+srv://")) {
    dns.setServers(["8.8.8.8", "8.8.4.4", "1.1.1.1"]);
  }

  mongoose.set("strictQuery", true);
  await mongoose.connect(uri);
}
