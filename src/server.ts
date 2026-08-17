import { createServer } from "http";
import { createApp } from "./app/createApp.js";
import { connectDatabase, env, logger, initSocketIO } from "./config/index.js";
import { ensureAdminFromEnv } from "./utils/ensureAdmin.js";
import { startReminderJob } from "./jobs/reminderJob.js";

async function main() {
  await connectDatabase();
  await ensureAdminFromEnv();
  startReminderJob();
  const app = createApp();
  const server = createServer(app);

  initSocketIO(server);

  server.listen(env.PORT, env.HOST, () => {
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
