import { config } from "../config";
import { logger } from "../logger";
import { setSourceStatus } from "../db/client";
import { BaseLogWatcher } from "./base";
import { PumpfunWatcher } from "./pumpfun";
import { RaydiumV4Watcher } from "./raydium-v4";
import { RaydiumCpmmWatcher } from "./raydium-cpmm";
import { PumpswapWatcher } from "./pumpswap";

export function startAllWatchers(): BaseLogWatcher[] {
  const wantPumpfun = config.watchers.pumpfun;
  const wantRayV4 = config.watchers.raydiumV4;
  const wantRayCpmm = config.watchers.raydiumCpmm;
  const wantPumpswap = config.watchers.pumpswap;

  const built: BaseLogWatcher[] = [];

  for (const [enabled, name, mk] of [
    [wantPumpfun, "pumpfun", () => new PumpfunWatcher()],
    [wantRayV4, "raydium-v4", () => new RaydiumV4Watcher()],
    [wantRayCpmm, "raydium-cpmm", () => new RaydiumCpmmWatcher()],
    [wantPumpswap, "pumpswap", () => new PumpswapWatcher()],
  ] as const) {
    if (!enabled) {
      logger.warn(`[${name}] disabled by config`);
      setSourceStatus(name, "disabled");
      continue;
    }
    try {
      const w = mk();
      w.start();
      built.push(w);
    } catch (err) {
      logger.error(`failed to start watcher ${name}`, err);
      setSourceStatus(name, "error", { lastError: String(err) });
    }
  }

  return built;
}
