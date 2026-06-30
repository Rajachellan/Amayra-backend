import "dotenv/config";
import { createApp } from "./app.js";
import { connectDb } from "./config/db.js";
import { ensureAdminFromEnv } from "./utils/ensureAdmin.js";

const port = Number(process.env.PORT) || 4000;
const mongoUri = process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/amayra";

async function main() {
  await connectDb(mongoUri);
  await ensureAdminFromEnv();
  const app = createApp();
  const host = process.env.HOST ?? "0.0.0.0";
  app.listen(port, host, () => {
    console.log(`API listening on http://${host}:${port}`);
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
