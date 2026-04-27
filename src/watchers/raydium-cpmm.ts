import { BaseLogWatcher, isLikelyMint, type ParsedLogEvent } from "./base";
import { LAUNCH_LOG_MARKERS, PROGRAM_IDS } from "./constants";
import { upsertLaunch, type LaunchSource } from "../db/client";
import { fetchMetadataWithRetry } from "./metadata";
import { logger } from "../logger";

const seen = new Set<string>();

/**
 * Raydium CPMM — newer constant-product market maker. Pool creation logs
 * "Instruction: Initialize" or "Instruction: CreatePool" depending on client.
 */
export class RaydiumCpmmWatcher extends BaseLogWatcher {
  readonly source: LaunchSource = "raydium-cpmm";
  readonly programId = PROGRAM_IDS.RAYDIUM_CPMM;
  readonly displayName = "Raydium CPMM";

  protected async handleEvent(event: ParsedLogEvent): Promise<void> {
    const hasMarker = event.logs.some((l) =>
      LAUNCH_LOG_MARKERS.RAYDIUM_CPMM.some((m) => l.includes(m)),
    );
    if (!hasMarker) return;
    // CPMM also runs swap "Initialize" variants; gate on at least one new token balance.
    if (seen.has(event.signature)) return;
    seen.add(event.signature);

    const tx = await this.fetchTransaction(event.signature);
    if (!tx) return;

    const accountKeys = tx.transaction.message.accountKeys.map((k: any) =>
      typeof k === "string" ? k : k.pubkey.toString(),
    );
    const creator = accountKeys[0] ?? null;

    const post = tx.meta?.postTokenBalances ?? [];
    const pre = tx.meta?.preTokenBalances ?? [];
    // True pool creation: a token balance account that did not exist pre-tx.
    const newAccountIndices = new Set<number>(
      post.map((b: any) => b.accountIndex).filter(
        (i: number) => !pre.some((p: any) => p.accountIndex === i),
      ),
    );
    if (newAccountIndices.size === 0) return;

    const mintsInNew = new Set<string>();
    for (const b of post) {
      if (newAccountIndices.has(b.accountIndex) && b.mint && b.mint !== PROGRAM_IDS.WSOL) {
        mintsInNew.add(b.mint);
      }
    }
    const mint = [...mintsInNew][0];
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
    logger.info(`[raydium-cpmm] new pool: ${meta?.symbol ?? "?"} (${mint.slice(0, 8)}…) liq=${initialSol ?? "?"} SOL`);
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
