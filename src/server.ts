import { createServer } from "node:http";
import { createApp, buildDependencies } from "./app";
import { loadEnv } from "./config/env";
import { runPreflight } from "./modules/health/preflight";
import { logger } from "./utils/logger";

async function main() {
  const config = loadEnv();
  const deps = buildDependencies(config);
  const preflight = await runPreflight(config, deps.health, deps.alerts);
  if (preflight.mode === "degraded") {
    logger.warn({ preflight }, "starting in degraded mode");
  }

  const app = createApp(config, deps);
  const server = createServer(app);

  const intervalMs = Math.max(1, config.healthcheckIntervalMinutes) * 60_000;
  const healthTimer = setInterval(() => {
    deps.health.readiness().catch((error) => logger.error({ err: error }, "scheduled healthcheck failed"));
  }, intervalMs);
  healthTimer.unref();

  server.listen(config.port, () => {
    logger.info({ port: config.port }, "server listening");
  });
}

main().catch((error) => {
  logger.fatal({ err: error }, "server startup failed");
  process.exit(1);
});
