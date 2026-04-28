/**
 * Settlement smoke test for solana-launch-oracle.
 *
 * Why: the CDP Bazaar extension only registers a resource after the FIRST
 * successful x402 settlement on a Bazaar-aware route. This script wires up an
 * x402 buyer (Base mainnet USDC, $0.001) and hits /launches/recent once so the
 * facilitator catalogs us into the marketplace.
 *
 * Run:
 *   TARGET_URL=https://oracle-production-d5ba.up.railway.app/launches/recent \
 *   TEST_BUYER_PRIVATE_KEY=0xabc... \
 *   npx tsx scripts/test-settlement.ts
 *
 * The test wallet must hold a tiny amount of USDC ($0.01 is plenty) and a few
 * cents of ETH on Base mainnet for gas. After this completes, verify Bazaar
 * registration at:
 *   https://api.cdp.coinbase.com/platform/v2/x402/discovery/merchant?payTo=<your-receiver>
 */

import "dotenv/config";

async function main(): Promise<void> {
  const targetUrl = process.env.TARGET_URL;
  const privateKey = process.env.TEST_BUYER_PRIVATE_KEY;

  if (!targetUrl) throw new Error("TARGET_URL not set");
  if (!privateKey) throw new Error("TEST_BUYER_PRIVATE_KEY not set");
  if (!privateKey.startsWith("0x") || privateKey.length !== 66) {
    throw new Error("TEST_BUYER_PRIVATE_KEY must be a 0x-prefixed 32-byte hex string");
  }

  const { wrapFetchWithPaymentFromConfig, decodePaymentResponseHeader } = await import("@x402/fetch");
  const { ExactEvmScheme } = await import("@x402/evm/exact/client");
  const { privateKeyToAccount } = await import("viem/accounts");

  const account = privateKeyToAccount(privateKey as `0x${string}`);
  console.log(`[buyer] address=${account.address}`);
  console.log(`[buyer] target=${targetUrl}`);

  const fetchWithPayment = wrapFetchWithPaymentFromConfig(fetch, {
    schemes: [
      {
        network: "eip155:8453",
        client: new ExactEvmScheme({ signer: account }),
      },
    ],
  });

  const t0 = Date.now();
  const res = await fetchWithPayment(targetUrl, { method: "GET" });
  const elapsedMs = Date.now() - t0;

  console.log(`[response] status=${res.status} elapsed=${elapsedMs}ms`);
  console.log(`[response] headers:`);
  res.headers.forEach((v, k) => {
    if (/payment|extension/i.test(k)) console.log(`  ${k}: ${v.slice(0, 200)}${v.length > 200 ? "..." : ""}`);
  });

  const paymentResponseHeader = res.headers.get("PAYMENT-RESPONSE") ?? res.headers.get("X-PAYMENT-RESPONSE");
  if (paymentResponseHeader) {
    const decoded = decodePaymentResponseHeader(paymentResponseHeader);
    console.log(`[settlement]`, JSON.stringify(decoded, null, 2));
  } else {
    console.log("[settlement] no PAYMENT-RESPONSE header (request may not have settled)");
  }

  const extResponses = res.headers.get("EXTENSION-RESPONSES") ?? res.headers.get("X-EXTENSION-RESPONSES");
  if (extResponses) {
    console.log(`[bazaar] EXTENSION-RESPONSES=${extResponses}`);
    console.log("[bazaar] If this shows bazaar=processing or bazaar=accepted, registration was triggered.");
  }

  if (!res.ok) {
    const body = await res.text();
    console.error(`[error] body=${body}`);
    process.exit(1);
  }

  const data = await res.json();
  console.log(`[body]`, JSON.stringify(data, null, 2).slice(0, 600));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
