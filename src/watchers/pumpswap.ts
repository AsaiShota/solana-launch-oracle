import { BaseLogWatcher, isLikelyMint, type ParsedLogEvent } from "./base";
import { LAUNCH_LOG_MARKERS, PROGRAM_IDS } from "./constants";
import { upsertLaunch, type LaunchSource } from "../db/client";
import { fetchMetadataWithRetry } from "./metadata";
import { logger } from "../logger";

const seen = new Set<string>();

/**
 * PumpSwap — pump.fun's own AMM, fired when a token "graduates" from the
 * bonding curve to a pool. We watch for CreatePool / Initialize.
 */
export class PumpswapWatcher extends BaseLogWatcher {
  readonly source: LaunchSource = "pumpswap";
  readonly programId = PROGRAM_IDS.PUMPSWAP;
  readonly displayName = "PumpSwap";

  protected async handleEvent(event: ParsedLogEvent): Promise<void> {
    const hasMarker = event.logs.some((l) =>
      LAUNCH_LOG_MARKERS.PUMPSWAP.some((m) => l.includes(m)),
    );
    if (!hasMarker) return;
    if (seen.has(event.signature)) return;
    seen.add(event.signature);

    const tx = await this.fetchTransaction(event.signature);
    if (!tx) return;

    const accountKeys = tx.transaction.message.accountKeys.map((k: any) =>
      typeof k === "string" ? k : k.pubkey.toString(),
    );
    const creator = accountKeys[0] ?? null;

    const post = tx.meta?.postTokenBalances ?? [];
    const mints = new Set<string>();
    for (const b of post) {
      if (b.mint && b.mint !== PROGRAM_IDS.WSOL) mints.add(b.mint);
    }
    const mint = [...mints][0];
    if (!mint || !isLikelyMint(mint)) return;

    const initialSol = computeWsolDelta(tx);
    const poolAddress = accountKeys[1] ?? null;
    const meta = await fetchMetadataWithRetry(this.connection, mint, false);

    upsertLaunch({
      mint,
      source: this.source,
      signature: event.signature,
      name: meta?.name ?? null,
      symbol: meta?.symbol ?? null,
      metadata_uri: meta?.uri ?? null,
      creator,
      pool_address: poolAddress,
      initial_liquidity_sol: initialSol,
    });
    logger.info(`[pumpswap] graduated: ${meta?.symbol ?? "?"} (${mint.slice(0, 8)}…) liq=${initialSol ?? "?"} SOL`);
  }
}

function computeWsolDelta(tx: any): number | null {
  try {
    const post = tx.meta?.postTokenBalances ?? [];
    const pre = tx.meta?.preTokenBalances ?? [];
    let postSum = 0;
    for (const b of post) {
      if (b.mint === PROGRAM_IDS.WSOL) postSum += Number(b.uiTokenAmount?.uiAmount ?? 0);
    }
    let preSum = 0;
    for (const b of pre) {
      if (b.mint === PROGRAM_IDS.WSOL) preSum += Number(b.uiTokenAmount?.uiAmount ?? 0);
    }
    const delta = postSum - preSum;
    return delta > 0 ? delta : null;
  } catch {
    return null;
  }
}
