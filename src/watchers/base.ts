import WebSocket from "ws";
import { Connection, PublicKey } from "@solana/web3.js";
import { config } from "../config";
import { logger } from "../logger";
import { setSourceStatus, type LaunchSource } from "../db/client";
import { PROGRAM_IDS } from "./constants";

export interface ParsedLogEvent {
  signature: string;
  logs: string[];
  slot: number | null;
}

export type LogHandler = (event: ParsedLogEvent) => Promise<void> | void;

/**
 * BaseLogWatcher: subscribes to `logsSubscribe { mentions: [programId] }` over
 * Helius WebSocket and dispatches every successful tx to the handler.
 *
 * Subclasses pick what to do with the logs (parse mints, pool addresses, etc.).
 *
 * Why this base class: all 4 watchers (pump.fun, raydium-v4, raydium-cpmm,
 * pumpswap) share the exact same WS lifecycle — connect, subscribe, ping,
 * reconnect with exponential backoff, surface health to the DB. Centralizing
 * it means a fix to reconnection helps every source at once.
 */
export abstract class BaseLogWatcher {
  protected ws: WebSocket | null = null;
  protected reconnectAttempts = 0;
  protected requestId = 1;
  protected pingTimer: NodeJS.Timeout | null = null;
  protected lastEventAt: number | null = null;

  abstract readonly source: LaunchSource;
  abstract readonly programId: string;
  abstract readonly displayName: string;

  protected connection: Connection;

  constructor() {
    this.connection = new Connection(config.helius.rpcUrl, "confirmed");
  }

  start(): void {
    setSourceStatus(this.source, "connecting");
    this.connect();
  }

  stop(): void {
    if (this.pingTimer) clearInterval(this.pingTimer);
    if (this.ws) {
      this.ws.removeAllListeners();
      this.ws.close();
      this.ws = null;
    }
    setSourceStatus(this.source, "disabled");
  }

  protected getReconnectDelay(): number {
    return Math.min(1000 * 2 ** this.reconnectAttempts, config.ws.maxReconnectDelayMs);
  }

  protected connect(): void {
    logger.info(`[${this.source}] connecting to Helius WS`);
    try {
      this.ws = new WebSocket(config.helius.wssUrl);
    } catch (err) {
      logger.error(`[${this.source}] WS construction failed`, err);
      setSourceStatus(this.source, "error", { lastError: String(err) });
      this.scheduleReconnect();
      return;
    }

    this.ws.on("open", () => {
      logger.info(`[${this.source}] WS open`);
      this.reconnectAttempts = 0;
      this.subscribe();
      this.startPing();
      setSourceStatus(this.source, "ok");
    });

    this.ws.on("message", (raw) => {
      try {
        const msg = JSON.parse(raw.toString());
        this.routeMessage(msg);
      } catch (err) {
        logger.error(`[${this.source}] failed to parse WS message`, err);
      }
    });

    this.ws.on("close", (code, reason) => {
      logger.warn(`[${this.source}] WS closed code=${code} reason=${reason?.toString()}`);
      setSourceStatus(this.source, "error", { lastError: `WS closed code=${code}` });
      this.cleanupSocket();
      this.scheduleReconnect();
    });

    this.ws.on("error", (err) => {
      logger.error(`[${this.source}] WS error`, err);
      setSourceStatus(this.source, "error", { lastError: err.message });
    });
  }

  protected subscribe(): void {
    if (!this.ws) return;
    const id = this.requestId++;
    const req = {
      jsonrpc: "2.0",
      id,
      method: "logsSubscribe",
      params: [{ mentions: [this.programId] }, { commitment: "processed" }],
    };
    this.ws.send(JSON.stringify(req));
    logger.info(`[${this.source}] subscribed to ${this.displayName} (reqId=${id})`);
  }

  protected startPing(): void {
    if (this.pingTimer) clearInterval(this.pingTimer);
    this.pingTimer = setInterval(() => {
      if (this.ws?.readyState === WebSocket.OPEN) {
        try {
          this.ws.ping();
        } catch (err) {
          logger.debug(`[${this.source}] ping failed`, err);
        }
      }
    }, config.ws.pingIntervalMs);
  }

  protected cleanupSocket(): void {
    if (this.pingTimer) {
      clearInterval(this.pingTimer);
      this.pingTimer = null;
    }
    if (this.ws) {
      this.ws.removeAllListeners();
      this.ws = null;
    }
  }

  protected scheduleReconnect(): void {
    const delay = this.getReconnectDelay();
    this.reconnectAttempts++;
    logger.info(`[${this.source}] reconnecting in ${delay}ms (attempt ${this.reconnectAttempts})`);
    setTimeout(() => this.connect(), delay);
  }

  protected routeMessage(msg: any): void {
    // subscribe ack: { result: <sub_id>, id: <req_id> }
    if (msg.method === "logsNotification" && msg.params?.result?.value) {
      const value = msg.params.result.value;
      if (value.err) return;
      const event: ParsedLogEvent = {
        signature: value.signature,
        logs: value.logs ?? [],
        slot: msg.params?.result?.context?.slot ?? null,
      };
      this.lastEventAt = Date.now();
      void this.handleEvent(event).catch((err) => {
        logger.error(`[${this.source}] handleEvent failed`, err);
      });
      // Heartbeat: any successful event keeps source state OK.
      setSourceStatus(this.source, "ok", { lastEventAt: this.lastEventAt });
    }
  }

  protected abstract handleEvent(event: ParsedLogEvent): Promise<void>;

  /**
   * Best-effort tx fetch to recover post-tx accounts (mint, pool addresses).
   * We use jsonParsed so SPL/Token-2022 ix come back decoded.
   */
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
