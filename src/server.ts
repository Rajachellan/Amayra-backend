import { createApp } from "./app/createApp.js";
import { connectDatabase, env, logger } from "./config/index.js";
import { ensureAdminFromEnv } from "./utils/ensureAdmin.js";

async function main() {
  await connectDatabase();
  await ensureAdminFromEnv();
  const app = createApp();
  app.listen(env.PORT, env.HOST, () => {
    logger.info(
      { env: env.NODE_ENV, host: env.HOST, port: env.PORT },
      `API listening on http://${env.HOST}:${env.PORT}`
    );
  });
}

main().catch((err) => {
  logger.error(
    {
      err: err instanceof Error ? { message: err.message, stack: err.stack } : String(err),
    },
    "Fatal startup error"
  );
  process.exit(1);
});
