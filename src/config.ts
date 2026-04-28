import "dotenv/config";

function required(name: string, fallback?: string): string {
  const v = process.env[name];
  if (v && v.length > 0) return v;
  if (fallback !== undefined) return fallback;
  throw new Error(`Missing env var: ${name}`);
}

function optional(name: string, fallback: string): string {
  return process.env[name] && process.env[name]!.length > 0
    ? process.env[name]!
    : fallback;
}

function bool(name: string, fallback: boolean): boolean {
  const v = process.env[name];
  if (v === undefined) return fallback;
  return v.toLowerCase() === "true" || v === "1";
}

const heliusApiKey = process.env.HELIUS_API_KEY ?? "";
const heliusWssUrl = optional(
  "HELIUS_WSS_URL",
  heliusApiKey
    ? `wss://mainnet.helius-rpc.com/?api-key=${heliusApiKey}`
    : "wss://mainnet.helius-rpc.com/?api-key=MISSING",
);
const heliusRpcUrl = optional(
  "HELIUS_RPC_URL",
  heliusApiKey
    ? `https://mainnet.helius-rpc.com/?api-key=${heliusApiKey}`
    : "https://api.mainnet-beta.solana.com",
);

export const config = {
  port: Number(optional("PORT", "3000")),
  databasePath: optional("DATABASE_PATH", "./data/launches.db"),
  logLevel: optional("LOG_LEVEL", "info"),

  helius: {
    apiKey: heliusApiKey,
    wssUrl: heliusWssUrl,
    rpcUrl: heliusRpcUrl,
  },

  anthropic: {
    apiKey: process.env.ANTHROPIC_API_KEY ?? "",
    model: optional("ANTHROPIC_MODEL", "claude-haiku-4-5-20251001"),
  },

  x402: {
    receiverAddress: optional(
      "X402_RECEIVER_ADDRESS",
      "0x0000000000000000000000000000000000000000",
    ),
    facilitatorUrl: optional(
      "X402_FACILITATOR_URL",
      "https://api.cdp.coinbase.com/platform/v2/x402",
    ),
    network: optional("X402_NETWORK", "base"),
    cdpApiKeyId: process.env.CDP_API_KEY_ID ?? "",
    cdpApiKeySecret: process.env.CDP_API_KEY_SECRET ?? "",
  },

  watchers: {
    pumpfun: bool("ENABLE_PUMPFUN", true),
    raydiumV4: bool("ENABLE_RAYDIUM_V4", true),
    raydiumCpmm: bool("ENABLE_RAYDIUM_CPMM", true),
    pumpswap: bool("ENABLE_PUMPSWAP", true),
  },

  ws: {
    maxReconnectDelayMs: 30_000,
    pingIntervalMs: 30_000,
  },

  cleanup: {
    retentionHours: 24,
    intervalMs: 60 * 60 * 1000, // 1h
  },
};

export type Config = typeof config;
