import type { MiddlewareHandler } from "hono";
import { config } from "../config";
import { logger } from "../logger";

/**
 * x402 middleware factory.
 *
 * Default path: load `x402-hono` v1 (single package, simple API) and wire each
 * route + price + Base network + receiver address. Why v1 (not v2 @x402/*):
 * the v1 API is one import call and matches the original task spec; the v2
 * split (`@x402/hono` + `@x402/core` + `@x402/evm`) is the strategic future
 * but adds three packages and a more verbose initialization. Migration path
 * is tracked in the package README — swap this file when ready.
 *
 * Fallback: if `x402-hono` is missing or throws on init, drop to a placeholder
 * middleware that returns HTTP 402 unless an `X-PAYMENT` header is present.
 * This keeps the rest of the service deployable.
 */

export interface PriceMap {
  [routePath: string]: string; // e.g., "/launches/recent": "$0.001"
}

export async function buildPaymentMiddleware(prices: PriceMap): Promise<MiddlewareHandler> {
  const network = mapNetwork(config.x402.network);
  const payTo = config.x402.receiverAddress as `0x${string}`;
  const facilitatorUrl = config.x402.facilitatorUrl;

  if (!payTo.startsWith("0x") || payTo.length !== 42) {
    logger.warn(`X402_RECEIVER_ADDRESS is not a valid EVM address (${payTo}); using placeholder middleware`);
    return placeholderMiddleware(prices);
  }

  try {
    const mod: any = await dynImport("x402-hono");
    const { paymentMiddleware } = mod;
    if (typeof paymentMiddleware !== "function") {
      throw new Error("x402-hono.paymentMiddleware is not a function");
    }

    const routes: Record<string, any> = {};
    for (const [path, price] of Object.entries(prices)) {
      routes[path] = {
        price,
        network,
        config: {
          description: `Solana token launch data - ${path}`,
          mimeType: "application/json",
          maxTimeoutSeconds: 60,
        },
      };
    }

    const mw = paymentMiddleware(payTo, routes, { url: facilitatorUrl });
    logger.info(
      `x402 middleware initialized (network=${network}, payTo=${payTo}, routes=${Object.keys(prices).join(",")})`,
    );
    return mw as MiddlewareHandler;
  } catch (err) {
    logger.warn(
      "x402-hono unavailable or failed to init — falling back to placeholder 402 middleware. " +
        "TODO: replace with proper x402 SDK once installation is resolved.",
      err,
    );
    return placeholderMiddleware(prices);
  }
}

function mapNetwork(input: string): "base" | "base-sepolia" {
  // x402-hono v1 expects "base" or "base-sepolia" string literals.
  const v = input.toLowerCase();
  if (v === "base-sepolia" || v === "eip155:84532") return "base-sepolia";
  // Default everything else to mainnet "base".
  return "base";
}

async function dynImport(name: string): Promise<unknown> {
  return await (Function("n", "return import(n)") as (n: string) => Promise<unknown>)(name);
}

/**
 * Placeholder middleware: returns 402 unless `X-PAYMENT` header is present.
 * Body matches the spirit of the x402 spec so AI-agent clients can still see
 * the price requirement and decide.
 *
 * TODO: replace with proper x402 SDK once package install is verified.
 */
function placeholderMiddleware(prices: PriceMap): MiddlewareHandler {
  return async (c, next) => {
    const path = c.req.path;
    let priceStr: string | null = null;

    for (const [pat, p] of Object.entries(prices)) {
      if (matchPath(pat, path)) {
        priceStr = p;
        break;
      }
    }

    if (!priceStr) return next();

    const payment = c.req.header("X-PAYMENT") ?? c.req.header("x-payment");
    if (payment) {
      logger.warn(`[x402-placeholder] accepting unverified X-PAYMENT for ${c.req.method} ${path}`);
      return next();
    }

    return c.json(
      {
        x402Version: 1,
        error: "Payment Required",
        accepts: [
          {
            scheme: "exact",
            price: priceStr,
            network: mapNetwork(config.x402.network),
            payTo: config.x402.receiverAddress,
            resource: `${c.req.method} ${path}`,
            description: `Solana token launch data - ${path}`,
            mimeType: "application/json",
          },
        ],
      },
      402,
    );
  };
}

function matchPath(pattern: string, actual: string): boolean {
  const pParts = pattern.split("/").filter(Boolean);
  const aParts = actual.split("/").filter(Boolean);
  const wild = pParts[pParts.length - 1] === "*";
  if (!wild && pParts.length !== aParts.length) return false;
  if (wild && aParts.length < pParts.length - 1) return false;

  const len = wild ? pParts.length - 1 : pParts.length;
  for (let i = 0; i < len; i++) {
    const p = pParts[i];
    const a = aParts[i];
    if (p.startsWith(":")) continue;
    if (p !== a) return false;
  }
  return true;
}
