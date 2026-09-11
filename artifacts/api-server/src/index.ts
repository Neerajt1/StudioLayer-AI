import app from "./app";
import { logger } from "./lib/logger";
import { validateR2Storage } from "./lib/r2-config.js";
import { logHeadlessForensicsStartupConfig } from "./services/rendering/headless-forensics.js";

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

await validateR2Storage();

// TEMPORARY DIAGNOSTIC — confirms whether this process recognizes the flag.
logHeadlessForensicsStartupConfig();

app.listen(port, (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

  logger.info({ port }, "Server listening");
});
