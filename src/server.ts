import "dotenv/config";
import { createApp } from "./app.js";
import { connectDb } from "./config/db.js";

const port = Number(process.env.PORT) || 4000;
const mongoUri = process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/amayra";

async function main() {
  await connectDb(mongoUri);
  const app = createApp();
  app.listen(port, () => {
    console.log(`API listening on http://localhost:${port}`);
    console.log("Environment reloaded.");
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
