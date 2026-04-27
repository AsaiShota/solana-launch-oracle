import { config } from "./config";

type Level = "debug" | "info" | "warn" | "error";
const levels: Record<Level, number> = { debug: 10, info: 20, warn: 30, error: 40 };

const threshold = levels[(config.logLevel as Level) ?? "info"] ?? 20;

function ts(): string {
  return new Date().toISOString();
}

function emit(level: Level, msg: string, extra?: unknown) {
  if (levels[level] < threshold) return;
  const line = `[${ts()}] [${level.toUpperCase()}] ${msg}`;
  if (extra !== undefined) {
    const e = extra instanceof Error ? { message: extra.message, stack: extra.stack } : extra;
    console.log(line, e);
  } else {
    console.log(line);
  }
}

export const logger = {
  debug: (msg: string, extra?: unknown) => emit("debug", msg, extra),
  info: (msg: string, extra?: unknown) => emit("info", msg, extra),
  warn: (msg: string, extra?: unknown) => emit("warn", msg, extra),
  error: (msg: string, extra?: unknown) => emit("error", msg, extra),
};
