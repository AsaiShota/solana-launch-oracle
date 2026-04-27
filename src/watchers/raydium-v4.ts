import { BaseLogWatcher, isLikelyMint, type ParsedLogEvent } from "./base";
import { LAUNCH_LOG_MARKERS, PROGRAM_IDS } from "./constants";
import { upsertLaunch, type LaunchSource } from "../db/client";
import { fetchMetadataWithRetry } from "./metadata";
import { logger } from "../logger";

const seen = new Set<string>();

/**
 * Raydium AMM V4 — pool initialization is signaled by the "initialize2" log.
 * The new pool's base/quote mints appear in postTokenBalances.
 */
export class RaydiumV4Watcher extends BaseLogWatcher {
  readonly source: LaunchSource = "raydium-v4";
  readonly programId = PROGRAM_IDS.RAYDIUM_AMM_V4;
  readonly displayName = "Raydium AMM V4";

  protected async handleEvent(event: ParsedLogEvent): Promise<void> {
    const hasMarker = event.logs.some((l) =>
      LAUNCH_LOG_MARKERS.RAYDIUM_AMM_V4.some((m) => l.includes(m)),
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

    const tokenBalances = tx.meta?.postTokenBalances ?? [];
    const mints = new Set<string>();
    for (const b of tokenBalances) {
      if (b.mint && b.mint !== PROGRAM_IDS.WSOL) mints.add(b.mint);
    }
    // Pick the non-WSOL token. If multiple, take the first.
    const mint = [...mints][0];
    if (!mint || !isLikelyMint(mint)) {
      logger.debug(`[raydium-v4] no candidate mint in tx ${event.signature}`);
      return;
    }

    // Initial liquidity in SOL: sum of WSOL post-balances on pool accounts minus pre.
    const initialSol = computeWsolDelta(tx);

    // Pool address: Raydium V4 places it at known index; safer to grab the first
    // account that is writable and NOT a known program/system address. For MVP,
    // we record the signer-adjacent likely pool address (account index 1 by convention).
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
    logger.info(`[raydium-v4] new pool: ${meta?.symbol ?? "?"} (${mint.slice(0, 8)}…) liq=${initialSol ?? "?"} SOL`);
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
