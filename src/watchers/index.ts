import { config } from "../config";
import { logger } from "../logger";
import { setSourceStatus } from "../db/client";
import { BaseLogWatcher } from "./base";
import { PumpfunWatcher } from "./pumpfun";
import { RaydiumV4Watcher } from "./raydium-v4";
import { RaydiumCpmmWatcher } from "./raydium-cpmm";
import { PumpswapWatcher } from "./pumpswap";
import { LogWsPool } from "./ws-pool";

export interface WatcherRig {
  pool: LogWsPool;
  watchers: BaseLogWatcher[];
}

export function startAllWatchers(): WatcherRig {
  const pool = new LogWsPool();
  const watchers: BaseLogWatcher[] = [];

  for (const [enabled, name, mk] of [
    [config.watchers.pumpfun, "pumpfun", () => new PumpfunWatcher()],
    [config.watchers.raydiumV4, "raydium-v4", () => new RaydiumV4Watcher()],
    [config.watchers.raydiumCpmm, "raydium-cpmm", () => new RaydiumCpmmWatcher()],
    [config.watchers.pumpswap, "pumpswap", () => new PumpswapWatcher()],
  ] as const) {
    if (!enabled) {
      logger.warn(`[${name}] disabled by config`);
      setSourceStatus(name, "disabled");
      continue;
    }
    try {
      const w = mk();
      w.start(pool);
      watchers.push(w);
    } catch (err) {
      logger.error(`failed to register watcher ${name}`, err);
      setSourceStatus(name, "error", { lastError: String(err) });
    }
  }

  pool.start();
  return { pool, watchers };
}
