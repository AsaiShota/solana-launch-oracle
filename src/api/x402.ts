import type { MiddlewareHandler } from "hono";
import { config } from "../config";
import { logger } from "../logger";

/**
 * x402 v2 middleware factory with Bazaar discovery extension.
 *
 * Why v2: the v1 `x402-hono` package does not support the Bazaar extension
 * pipeline; CDP's auto-cataloging triggers on `bazaarResourceServerExtension`
 * + `declareDiscoveryExtension()` declared in the route config. First
 * successful settlement against a Bazaar-aware route causes the CDP
 * facilitator to index the resource into the public catalog.
 *
 * Fallback: if any v2 package is missing or init throws, drop to a placeholder
 * middleware so the rest of the service still boots — same behavior as v1.
 */

export async function buildPaymentMiddleware(): Promise<MiddlewareHandler> {
  const networkCaip2 = mapNetworkCaip2(config.x402.network);
  const payTo = config.x402.receiverAddress as `0x${string}`;
  const facilitatorUrl = config.x402.facilitatorUrl;

  if (!payTo.startsWith("0x") || payTo.length !== 42) {
    logger.warn(`X402_RECEIVER_ADDRESS is not a valid EVM address (${payTo}); using placeholder middleware`);
    return placeholderMiddleware();
  }

  try {
    const [coreServer, evmServer, ext, honoMod, cdpMod] = await Promise.all([
      dynImport("@x402/core/server"),
      dynImport("@x402/evm/exact/server"),
      dynImport("@x402/extensions/bazaar"),
      dynImport("@x402/hono"),
      dynImport("@coinbase/x402"),
    ]);

    const { HTTPFacilitatorClient, x402ResourceServer } = coreServer as any;
    const { ExactEvmScheme } = evmServer as any;
    const { bazaarResourceServerExtension, declareDiscoveryExtension } = ext as any;
    const { paymentMiddleware } = honoMod as any;
    const { createFacilitatorConfig } = cdpMod as any;

    const cdpKeyId = config.x402.cdpApiKeyId;
    const cdpKeySecret = config.x402.cdpApiKeySecret;

    let facilitatorClient: any;
    if (cdpKeyId && cdpKeySecret) {
      // @coinbase/x402 builds a FacilitatorConfig that signs each request with
      // the CDP API key (ECDSA JWT in Authorization header). Required for
      // verify/settle/getSupported against api.cdp.coinbase.com.
      const cfg = createFacilitatorConfig(cdpKeyId, cdpKeySecret);
      facilitatorClient = new HTTPFacilitatorClient({
        url: cfg.url ?? facilitatorUrl,
        createAuthHeaders: cfg.createAuthHeaders,
      });
      logger.info(`x402 facilitator: CDP-authenticated (url=${cfg.url ?? facilitatorUrl})`);
    } else {
      facilitatorClient = new HTTPFacilitatorClient({ url: facilitatorUrl });
      logger.warn(
        "CDP_API_KEY_ID / CDP_API_KEY_SECRET not set — facilitator calls will be unauthenticated and CDP will reject them with 401.",
      );
    }

    const resourceServer = new x402ResourceServer(facilitatorClient)
      .register(networkCaip2, new ExactEvmScheme())
      .registerExtension(bazaarResourceServerExtension);

    const routes = {
      "GET /launches/recent": {
        accepts: {
          scheme: "exact" as const,
          price: "$0.001",
          network: networkCaip2,
          payTo,
          maxTimeoutSeconds: 60,
        },
        description:
          "Real-time Solana token launch detection across Pump.fun, Raydium V4/CPMM, and PumpSwap. Returns launch metadata, liquidity, creator info.",
        mimeType: "application/json",
        extensions: {
          ...declareDiscoveryExtension({
            input: { since: 10, source: "all", limit: 20 },
            inputSchema: {
              properties: {
                since: {
                  type: "number",
                  description: "Minutes back to look (1-60). Default 10.",
                  minimum: 1,
                  maximum: 60,
                },
                source: {
                  type: "string",
                  description:
                    "Filter by launch venue. Use 'all' to include every source.",
                  enum: ["pumpfun", "raydium-v4", "raydium-cpmm", "pumpswap", "all"],
                },
                limit: {
                  type: "number",
                  description: "Max items to return (1-100). Default 20.",
                  minimum: 1,
                  maximum: 100,
                },
              },
            },
            output: {
              example: {
                since_minutes: 10,
                source: "all",
                count: 1,
                items: [
                  {
                    mint: "8xQk5y9JvmTzqYHj2hCQwsR1pZ8mFfL3xN7vHkBdGcVa",
                    source: "pumpfun",
                    signature:
                      "5j7sLW3hTX9qZbY8hQpJv1mFcRkN2pXgD4HsTnYwBvU3kRfMzC8VqLpA9oXn1bEcFsYrTuGhJiKlMnPq",
                    name: "Example Token",
                    symbol: "EX",
                    metadata_uri: "https://ipfs.io/ipfs/Qm...",
                    creator: "9y8uC3BfdQpAvR6sH2zXmKjLnE5tWg1NoYu7VxZbPi4",
                    initial_liquidity_sol: 4.21,
                    pool_address: "3krLp9ZsEqYbR2xN7vMoWsT8gKfH6cAj4DnUiVePqXyB",
                    created_at: "2026-04-28T05:10:00.000Z",
                  },
                ],
              },
            },
          }),
        },
      },
      "GET /launches/:mint": {
        accepts: {
          scheme: "exact" as const,
          price: "$0.005",
          network: networkCaip2,
          payTo,
          maxTimeoutSeconds: 60,
        },
        description:
          "Detailed launch info with AI-generated risk summary (English + Japanese) and 0-100 risk score for a specific Solana mint address.",
        mimeType: "application/json",
        extensions: {
          ...declareDiscoveryExtension({
            input: { mint: "8xQk5y9JvmTzqYHj2hCQwsR1pZ8mFfL3xN7vHkBdGcVa" },
            inputSchema: {
              properties: {
                mint: {
                  type: "string",
                  description:
                    "Solana SPL token mint address (base58, 32-50 chars).",
                  minLength: 32,
                  maxLength: 50,
                },
              },
              required: ["mint"],
            },
            output: {
              example: {
                mint: "8xQk5y9JvmTzqYHj2hCQwsR1pZ8mFfL3xN7vHkBdGcVa",
                source: "pumpfun",
                signature:
                  "5j7sLW3hTX9qZbY8hQpJv1mFcRkN2pXgD4HsTnYwBvU3kRfMzC8VqLpA9oXn1bEcFsYrTuGhJiKlMnPq",
                name: "Example Token",
                symbol: "EX",
                metadata_uri: "https://ipfs.io/ipfs/Qm...",
                creator: "9y8uC3BfdQpAvR6sH2zXmKjLnE5tWg1NoYu7VxZbPi4",
                initial_liquidity_sol: 4.21,
                pool_address: "3krLp9ZsEqYbR2xN7vMoWsT8gKfH6cAj4DnUiVePqXyB",
                created_at: "2026-04-28T05:10:00.000Z",
                ai_summary: {
                  en: "Newly minted Pump.fun token. Low initial liquidity (~4 SOL). Creator wallet has no prior history. Treat as high risk.",
                  ja: "Pump.fun の新規ミント。初期流動性が低く（約4 SOL）、作成者ウォレットに過去履歴なし。ハイリスク。",
                },
                risk_score: 73,
                ai_computed_at: "2026-04-28T05:10:05.000Z",
              },
            },
          }),
        },
      },
    };

    // syncFacilitatorOnStart: true when CDP credentials are present — the SDK
    // requires getSupported() to pass before it will build PaymentRequirements.
    // Without credentials we skip the sync so the server still boots, even though
    // any real settlement will fail with 401 until keys are configured.
    const syncOnStart = Boolean(cdpKeyId && cdpKeySecret);
    const mw = paymentMiddleware(routes, resourceServer, undefined, undefined, syncOnStart);
    logger.info(
      `x402 v2 middleware initialized (network=${networkCaip2}, payTo=${payTo}, bazaar=enabled, routes=GET /launches/recent,GET /launches/:mint, syncOnStart=${syncOnStart})`,
    );
    return mw as MiddlewareHandler;
  } catch (err) {
    logger.warn(
      "x402 v2 SDK unavailable or failed to init — falling back to placeholder 402 middleware. " +
        "TODO: re-check once @x402/* v2 packages are installed.",
      err,
    );
    return placeholderMiddleware();
  }
}

function mapNetworkCaip2(input: string): "eip155:8453" | "eip155:84532" {
  // v2 SDK requires CAIP-2 chain IDs. Map our env values to the canonical form.
  const v = input.toLowerCase();
  if (v === "base-sepolia" || v === "eip155:84532") return "eip155:84532";
  return "eip155:8453";
}

async function dynImport(name: string): Promise<unknown> {
  return await (Function("n", "return import(n)") as (n: string) => Promise<unknown>)(name);
}

/**
 * Placeholder middleware: returns 402 unless `X-PAYMENT` header is present.
 * Used only when v2 packages cannot load. Intentionally lacks Bazaar metadata.
 */
function placeholderMiddleware(): MiddlewareHandler {
  const prices: Record<string, string> = {
    "/launches/recent": "$0.001",
    "/launches/:mint": "$0.005",
  };

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
            network: mapNetworkCaip2(config.x402.network),
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
  if (pParts.length !== aParts.length) return false;
  for (let i = 0; i < pParts.length; i++) {
    if (pParts[i].startsWith(":")) continue;
    if (pParts[i] !== aParts[i]) return false;
  }
  return true;
}
