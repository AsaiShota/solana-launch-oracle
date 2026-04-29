import { Connection, PublicKey } from "@solana/web3.js";
import { config } from "../config";
import { logger } from "../logger";
import { type LaunchSource } from "../db/client";
import { PROGRAM_IDS } from "./constants";
import type { LogWsPool } from "./ws-pool";
import type { ParsedLogEvent } from "./base-types";

export type { ParsedLogEvent } from "./base-types";

/**
 * BaseLogWatcher — owns parsing/handling for one Solana program's logs.
 *
 * The actual WebSocket lifecycle lives in `LogWsPool`; the watcher only
 * registers a handler. This keeps all 4 program subscriptions multiplexed onto
 * a single WS connection (QuickNode free tier caps concurrent WSS at 2).
 */
export abstract class BaseLogWatcher {
  abstract readonly source: LaunchSource;
  abstract readonly programId: string;
  abstract readonly displayName: string;

  protected connection: Connection;

  constructor() {
    this.connection = new Connection(config.helius.rpcUrl, "confirmed");
  }

  start(pool: LogWsPool): void {
    pool.register({
      source: this.source,
      programId: this.programId,
      displayName: this.displayName,
      handler: (event) => this.handleEvent(event),
    });
  }

  protected abstract handleEvent(event: ParsedLogEvent): Promise<void>;

  protected async fetchTransaction(signature: string) {
    try {
      return await this.connection.getParsedTransaction(signature, {
        maxSupportedTransactionVersion: 0,
        commitment: "confirmed",
      });
    } catch (err) {
      logger.debug(`[${this.source}] getParsedTransaction failed for ${signature}`, err);
      return null;
    }
  }
}

export { PROGRAM_IDS };
export const BASE58_RE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

export function isLikelyMint(addr: string): boolean {
  if (!BASE58_RE.test(addr)) return false;
  try {
    new PublicKey(addr);
    return true;
  } catch {
    return false;
  }
}
