import app from "./app";
import { logger } from "./lib/logger";
import { initBackupScheduler } from "./routes/backup";
import { migrateLegacyStatuses } from "./lib/dataMigrations";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

app.listen(port, (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

  logger.info({ port }, "Server listening");
  initBackupScheduler().catch((e) => logger.error({ e }, "Backup scheduler init failed"));
  migrateLegacyStatuses().catch((e) => logger.error({ e }, "Legacy status migration failed"));
});
