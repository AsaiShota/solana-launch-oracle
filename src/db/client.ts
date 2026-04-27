import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import { config } from "../config";
import { logger } from "../logger";

export type LaunchSource = "pumpfun" | "raydium-v4" | "raydium-cpmm" | "pumpswap";
export type SourceState = "connecting" | "ok" | "error" | "disabled";

export interface LaunchRow {
  mint: string;
  source: LaunchSource;
  signature: string | null;
  name: string | null;
  symbol: string | null;
  metadata_uri: string | null;
  creator: string | null;
  initial_liquidity_sol: number | null;
  pool_address: string | null;
  created_at: number;
  updated_at: number;
  ai_summary_en: string | null;
  ai_summary_ja: string | null;
  risk_score: number | null;
  ai_computed_at: number | null;
}

export interface InsertLaunch {
  mint: string;
  source: LaunchSource;
  signature?: string | null;
  name?: string | null;
  symbol?: string | null;
  metadata_uri?: string | null;
  creator?: string | null;
  initial_liquidity_sol?: number | null;
  pool_address?: string | null;
}

export interface SourceStatusRow {
  source: string;
  state: SourceState;
  last_event_at: number | null;
  last_error: string | null;
  updated_at: number;
}

let db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (db) return db;

  const dbPath = path.resolve(config.databasePath);
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });

  db = new Database(dbPath);
  db.pragma("journal_mode = WAL");
  db.pragma("synchronous = NORMAL");
  db.pragma("foreign_keys = ON");

  const schemaPath = path.resolve("src/db/schema.sql");
  // Schema may be bundled into dist or read from src; tolerate both.
  let schema: string;
  if (fs.existsSync(schemaPath)) {
    schema = fs.readFileSync(schemaPath, "utf-8");
  } else {
    const distSchemaPath = path.resolve("dist/db/schema.sql");
    if (!fs.existsSync(distSchemaPath)) {
      throw new Error(`schema.sql not found at ${schemaPath} or ${distSchemaPath}`);
    }
    schema = fs.readFileSync(distSchemaPath, "utf-8");
  }
  db.exec(schema);

  logger.info(`SQLite ready at ${dbPath}`);
  return db;
}

// --- launches --------------------------------------------------------------

export function upsertLaunch(input: InsertLaunch): void {
  const now = Date.now();
  const stmt = getDb().prepare(`
    INSERT INTO launches (
      mint, source, signature, name, symbol, metadata_uri, creator,
      initial_liquidity_sol, pool_address, created_at, updated_at
    ) VALUES (
      @mint, @source, @signature, @name, @symbol, @metadata_uri, @creator,
      @initial_liquidity_sol, @pool_address, @created_at, @updated_at
    )
    ON CONFLICT(mint, source) DO UPDATE SET
      signature             = COALESCE(excluded.signature, launches.signature),
      name                  = COALESCE(excluded.name, launches.name),
      symbol                = COALESCE(excluded.symbol, launches.symbol),
      metadata_uri          = COALESCE(excluded.metadata_uri, launches.metadata_uri),
      creator               = COALESCE(excluded.creator, launches.creator),
      initial_liquidity_sol = COALESCE(excluded.initial_liquidity_sol, launches.initial_liquidity_sol),
      pool_address          = COALESCE(excluded.pool_address, launches.pool_address),
      updated_at            = excluded.updated_at
  `);
  stmt.run({
    mint: input.mint,
    source: input.source,
    signature: input.signature ?? null,
    name: input.name ?? null,
    symbol: input.symbol ?? null,
    metadata_uri: input.metadata_uri ?? null,
    creator: input.creator ?? null,
    initial_liquidity_sol: input.initial_liquidity_sol ?? null,
    pool_address: input.pool_address ?? null,
    created_at: now,
    updated_at: now,
  });
}

export interface RecentQuery {
  sinceMs: number;
  source?: LaunchSource;
  limit: number;
}

export function listRecent(q: RecentQuery): LaunchRow[] {
  const params: Record<string, unknown> = { since: q.sinceMs, limit: q.limit };
  let sql = `SELECT * FROM launches WHERE created_at >= @since`;
  if (q.source) {
    sql += ` AND source = @source`;
    params.source = q.source;
  }
  sql += ` ORDER BY created_at DESC LIMIT @limit`;
  return getDb().prepare(sql).all(params) as LaunchRow[];
}

export function getLaunchByMint(mint: string): LaunchRow[] {
  return getDb()
    .prepare(`SELECT * FROM launches WHERE mint = ? ORDER BY created_at DESC`)
    .all(mint) as LaunchRow[];
}

export function setAiSummary(
  mint: string,
  source: LaunchSource,
  en: string,
  ja: string,
  riskScore: number,
): void {
  getDb()
    .prepare(
      `UPDATE launches
         SET ai_summary_en = ?, ai_summary_ja = ?, risk_score = ?, ai_computed_at = ?
       WHERE mint = ? AND source = ?`,
    )
    .run(en, ja, riskScore, Date.now(), mint, source);
}

export function purgeOlderThan(cutoffMs: number): number {
  const res = getDb().prepare(`DELETE FROM launches WHERE created_at < ?`).run(cutoffMs);
  return res.changes;
}

// --- source_status --------------------------------------------------------

export function setSourceStatus(
  source: string,
  state: SourceState,
  opts: { lastEventAt?: number; lastError?: string | null } = {},
): void {
  const now = Date.now();
  getDb()
    .prepare(
      `INSERT INTO source_status (source, state, last_event_at, last_error, updated_at)
         VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(source) DO UPDATE SET
         state         = excluded.state,
         last_event_at = COALESCE(excluded.last_event_at, source_status.last_event_at),
         last_error    = excluded.last_error,
         updated_at    = excluded.updated_at`,
    )
    .run(
      source,
      state,
      opts.lastEventAt ?? null,
      opts.lastError ?? null,
      now,
    );
}

export function listSourceStatus(): SourceStatusRow[] {
  return getDb().prepare(`SELECT * FROM source_status ORDER BY source ASC`).all() as SourceStatusRow[];
}

export function startCleanupJob(): void {
  const run = () => {
    try {
      const cutoff = Date.now() - config.cleanup.retentionHours * 3600 * 1000;
      const purged = purgeOlderThan(cutoff);
      if (purged > 0) logger.info(`cleanup: purged ${purged} launches older than ${config.cleanup.retentionHours}h`);
    } catch (err) {
      logger.error("cleanup failed", err);
    }
  };
  // Run once at startup, then on interval.
  run();
  setInterval(run, config.cleanup.intervalMs).unref();
}
