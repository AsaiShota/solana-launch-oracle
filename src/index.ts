import { serve } from "@hono/node-server";
import { config } from "./config";
import { logger } from "./logger";
import { getDb, startCleanupJob, setSourceStatus } from "./db/client";
import { buildApp } from "./api/server";
import { startAllWatchers } from "./watchers";

async function main() {
  logger.info(`starting solana-launch-oracle (port=${config.port}, network=${config.x402.network})`);

  // 1. Initialize DB (creates schema + indexes).
  getDb();
  startCleanupJob();

  // 2. Pre-seed source status rows so /sources/status returns sensible data
  //    immediately (before WS open).
  for (const s of ["pumpfun", "raydium-v4", "raydium-cpmm", "pumpswap"]) {
    setSourceStatus(s, "connecting");
  }

  // 3. Boot watchers (each manages its own WS lifecycle).
  startAllWatchers();

  // 4. Boot HTTP server.
  const app = await buildApp();
  const server = serve({ fetch: app.fetch, port: config.port }, (info) => {
    logger.info(`listening on http://0.0.0.0:${info.port}`);
  });

  const shutdown = (sig: string) => {
    logger.info(`received ${sig}, shutting down`);
    server.close();
    process.exit(0);
  };
  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));
}

main().catch((err) => {
  logger.error("fatal startup error", err);
  process.exit(1);
});
