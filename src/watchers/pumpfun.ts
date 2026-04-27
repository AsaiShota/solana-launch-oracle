import { BaseLogWatcher, isLikelyMint, type ParsedLogEvent } from "./base";
import { LAUNCH_LOG_MARKERS, PROGRAM_IDS } from "./constants";
import { upsertLaunch, type LaunchSource } from "../db/client";
import { fetchMetadataWithRetry } from "./metadata";
import { logger } from "../logger";

const seen = new Set<string>(); // signature dedupe within process lifetime

export class PumpfunWatcher extends BaseLogWatcher {
  readonly source: LaunchSource = "pumpfun";
  readonly programId = PROGRAM_IDS.PUMPFUN;
  readonly displayName = "Pump.fun";

  protected async handleEvent(event: ParsedLogEvent): Promise<void> {
    const isLaunch = event.logs.some((l) =>
      LAUNCH_LOG_MARKERS.PUMPFUN.some((m) => l.includes(m)),
    );
    if (!isLaunch) return;
    if (seen.has(event.signature)) return;
    seen.add(event.signature);
    if (seen.size > 5000) {
      // bound memory: keep most recent half
      const arr = [...seen];
      seen.clear();
      arr.slice(-2500).forEach((s) => seen.add(s));
    }

    const tx = await this.fetchTransaction(event.signature);
    if (!tx) return;

    const message = tx.transaction.message;
    const accountKeys = message.accountKeys.map((k: any) => (typeof k === "string" ? k : k.pubkey.toString()));
    const creator = accountKeys[0] ?? null;

    // Pump.fun "Create" instruction places the new mint at a known account index.
    // To stay robust to layout shifts, scan all account keys for one that:
    //  - Is owned by SPL Token / Token-2022 (i.e., a mint)
    //  - Was created in this tx (postBalance > 0, preBalance == 0 OR account writable + new)
    // For an MVP we pick the first plausible base58 address that is NOT the program/payer.
    let mint: string | null = null;
    for (const key of accountKeys) {
      if (
        key &&
        isLikelyMint(key) &&
        key !== creator &&
        key !== PROGRAM_IDS.PUMPFUN &&
        key !== PROGRAM_IDS.WSOL &&
        key !== PROGRAM_IDS.SPL_TOKEN &&
        key !== PROGRAM_IDS.TOKEN_2022 &&
        key !== PROGRAM_IDS.METAPLEX_METADATA
      ) {
        // Check if this account became a mint in this tx (post token balance entry exists for it).
        const isPostMint = (tx.meta?.postTokenBalances ?? []).some(
          (b: any) => b.mint === key,
        );
        if (isPostMint) {
          mint = key;
          break;
        }
      }
    }

    if (!mint) {
      logger.debug(`[pumpfun] could not locate mint in tx ${event.signature}`);
      return;
    }

    // Pull metadata (best effort).
    const meta = await fetchMetadataWithRetry(this.connection, mint, false);

    upsertLaunch({
      mint,
      source: this.source,
      signature: event.signature,
      name: meta?.name ?? null,
      symbol: meta?.symbol ?? null,
      metadata_uri: meta?.uri ?? null,
      creator,
    });
    logger.info(`[pumpfun] new launch: ${meta?.symbol ?? "?"} (${mint.slice(0, 8)}…) sig=${event.signature.slice(0, 8)}…`);
  }
}
