import WebSocket from "ws";
import { config } from "../config";
import { logger } from "../logger";
import { setSourceStatus, type LaunchSource } from "../db/client";
import type { ParsedLogEvent } from "./base-types";

interface SubInfo {
  source: LaunchSource;
  programId: string;
  displayName: string;
  handler: (event: ParsedLogEvent) => Promise<void> | void;
}

/**
 * Single WebSocket shared by every watcher.
 *
 * Why: QuickNode's free Solana endpoint caps concurrent WSS connections at 2,
 * which silently drops half of our 4 watchers (1006). Multiplexing all
 * `logsSubscribe` calls onto one socket sidesteps the limit and is also kinder
 * to credit usage on any provider.
 */
export class LogWsPool {
  private ws: WebSocket | null = null;
  private reconnectAttempts = 0;
  private pingTimer: NodeJS.Timeout | null = null;
  private requestId = 1;
  private pendingSubs = new Map<number, SubInfo>();
  private activeSubs = new Map<number, SubInfo>();
  private registered: SubInfo[] = [];
  private stopped = false;

  register(info: SubInfo): void {
    this.registered.push(info);
    setSourceStatus(info.source, "connecting");
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.subscribe(info);
    }
  }

  start(): void {
    this.stopped = false;
    this.connect();
  }

  stop(): void {
    this.stopped = true;
    if (this.pingTimer) clearInterval(this.pingTimer);
    if (this.ws) {
      this.ws.removeAllListeners();
      this.ws.close();
      this.ws = null;
    }
    for (const r of this.registered) setSourceStatus(r.source, "disabled");
  }

  private connect(): void {
    logger.info(`[ws-pool] connecting (${this.registered.length} subs queued)`);
    try {
      this.ws = new WebSocket(config.helius.wssUrl);
    } catch (err) {
      logger.error(`[ws-pool] WS construction failed`, err);
      for (const r of this.registered) {
        setSourceStatus(r.source, "error", { lastError: String(err) });
      }
      this.scheduleReconnect();
      return;
    }

    this.ws.on("open", async () => {
      logger.info(`[ws-pool] WS open — re-subscribing ${this.registered.length} sources`);
      this.activeSubs.clear();
      this.pendingSubs.clear();
      // Stagger subscribes: QuickNode's free Solana endpoint terminates the
      // connection (1001 upstream went away) when 4 logsSubscribe messages
      // arrive in a burst right after handshake. 250ms apart is comfortable.
      for (const info of this.registered) {
        if (this.ws?.readyState !== WebSocket.OPEN) break;
        this.subscribe(info);
        await new Promise((r) => setTimeout(r, 250));
      }
      // Only reset attempts once we've successfully sent the full sub batch
      // and the connection is still alive — prevents the tight 1s-loop when
      // every connect dies mid-subscribe.
      if (this.ws?.readyState === WebSocket.OPEN) this.reconnectAttempts = 0;
      this.startPing();
    });

    this.ws.on("message", (raw) => {
      try {
        this.handleMessage(JSON.parse(raw.toString()));
      } catch (err) {
        logger.error(`[ws-pool] failed to parse message`, err);
      }
    });

    this.ws.on("close", (code, reason) => {
      logger.warn(`[ws-pool] WS closed code=${code} reason=${reason?.toString()}`);
      for (const r of this.registered) {
        setSourceStatus(r.source, "error", { lastError: `WS closed code=${code}` });
      }
      this.cleanup();
      if (!this.stopped) this.scheduleReconnect();
    });

    this.ws.on("error", (err) => {
      logger.error(`[ws-pool] WS error`, err);
    });
  }

  private subscribe(info: SubInfo): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    const id = this.requestId++;
    this.pendingSubs.set(id, info);
    this.ws.send(
      JSON.stringify({
        jsonrpc: "2.0",
        id,
        method: "logsSubscribe",
        params: [{ mentions: [info.programId] }, { commitment: "processed" }],
      }),
    );
    logger.info(`[ws-pool] -> subscribe ${info.source} (${info.displayName}) reqId=${id}`);
  }

  private handleMessage(msg: any): void {
    // Subscribe ack: {jsonrpc, result: <subId>, id: <reqId>}
    if (typeof msg.result === "number" && msg.id !== undefined) {
      const info = this.pendingSubs.get(msg.id);
      if (info) {
        this.activeSubs.set(msg.result, info);
        this.pendingSubs.delete(msg.id);
        setSourceStatus(info.source, "ok");
        logger.info(`[ws-pool] subscribed ${info.source} -> subId=${msg.result}`);
      }
      return;
    }

    // Notification: {method: "logsNotification", params: {subscription, result: {context, value}}}
    if (msg.method === "logsNotification" && msg.params?.result?.value) {
      const subId = msg.params.subscription;
      const info = this.activeSubs.get(subId);
      if (!info) return;
      const value = msg.params.result.value;
      if (value.err) return;
      const event: ParsedLogEvent = {
        signature: value.signature,
        logs: value.logs ?? [],
        slot: msg.params.result.context?.slot ?? null,
      };
      setSourceStatus(info.source, "ok", { lastEventAt: Date.now() });
      void Promise.resolve(info.handler(event)).catch((err) =>
        logger.error(`[${info.source}] handler failed`, err),
      );
    }
  }

  private startPing(): void {
    if (this.pingTimer) clearInterval(this.pingTimer);
    this.pingTimer = setInterval(() => {
      if (this.ws?.readyState === WebSocket.OPEN) {
        try {
          this.ws.ping();
        } catch (err) {
          logger.debug(`[ws-pool] ping failed`, err);
        }
      }
    }, config.ws.pingIntervalMs);
  }

  private cleanup(): void {
    if (this.pingTimer) {
      clearInterval(this.pingTimer);
      this.pingTimer = null;
    }
    if (this.ws) {
      this.ws.removeAllListeners();
      this.ws = null;
    }
  }

  private scheduleReconnect(): void {
    const delay = Math.min(1000 * 2 ** this.reconnectAttempts, config.ws.maxReconnectDelayMs);
    this.reconnectAttempts++;
    logger.info(`[ws-pool] reconnecting in ${delay}ms (attempt ${this.reconnectAttempts})`);
    setTimeout(() => {
      if (!this.stopped) this.connect();
    }, delay);
  }
}
