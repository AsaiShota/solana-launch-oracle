import { Hono } from "hono";
import launches from "./routes/launches";
import health from "./routes/health";
import { buildPaymentMiddleware } from "./x402";
import { logger } from "../logger";

export async function buildApp(): Promise<Hono> {
  const app = new Hono();

  // Light CORS for AI agents fetching from anywhere.
  app.use("*", async (c, next) => {
    c.header("Access-Control-Allow-Origin", "*");
    c.header("Access-Control-Allow-Methods", "GET,OPTIONS");
    c.header("Access-Control-Allow-Headers", "Content-Type, X-PAYMENT, x-payment");
    c.header("Access-Control-Expose-Headers", "X-PAYMENT-RESPONSE, x-payment-response");
    if (c.req.method === "OPTIONS") return c.body(null, 204);
    return next();
  });

  // Free routes (no x402): /health, /sources/status
  app.route("/", health);

  // Metered routes: /launches/*
  // Per-route prices: list = $0.001, detail (incl. AI summary) = $0.005
  const x402 = await buildPaymentMiddleware({
    "/launches/recent": "$0.001",
    "/launches/:mint": "$0.005",
  });
  app.use("/launches/*", x402);
  app.route("/launches", launches);

  // Root index for human visitors.
  app.get("/", (c) =>
    c.json({
      service: "solana-launch-oracle",
      docs: "https://github.com/AsaiShota/solana-launch-oracle",
      endpoints: {
        "GET /health": "free - service health",
        "GET /sources/status": "free - watcher connection status",
        "GET /launches/recent": "x402 $0.001 - list recent launches (?since=10&source=all&limit=20)",
        "GET /launches/:mint": "x402 $0.005 - launch detail with AI summary (EN/JA) and risk score",
      },
    }),
  );

  app.notFound((c) => c.json({ error: "not found", path: c.req.path }, 404));
  app.onError((err, c) => {
    logger.error(`unhandled in ${c.req.method} ${c.req.path}`, err);
    return c.json({ error: "internal error" }, 500);
  });

  return app;
}
