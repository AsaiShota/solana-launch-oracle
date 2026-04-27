-- Token launches detected from Solana DEX watchers.
-- One row per (mint, source) pair. Newer detections of the same mint update timestamps.

CREATE TABLE IF NOT EXISTS launches (
  mint                  TEXT NOT NULL,
  source                TEXT NOT NULL CHECK (source IN ('pumpfun','raydium-v4','raydium-cpmm','pumpswap')),
  signature             TEXT,
  name                  TEXT,
  symbol                TEXT,
  metadata_uri          TEXT,
  creator               TEXT,
  initial_liquidity_sol REAL,
  pool_address          TEXT,
  created_at            INTEGER NOT NULL,        -- unix ms
  updated_at            INTEGER NOT NULL,        -- unix ms
  ai_summary_en         TEXT,
  ai_summary_ja         TEXT,
  risk_score            INTEGER,                 -- 0-100, NULL = not yet computed
  ai_computed_at        INTEGER,
  PRIMARY KEY (mint, source)
);

CREATE INDEX IF NOT EXISTS idx_launches_created_at ON launches(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_launches_source_created ON launches(source, created_at DESC);

-- Source health: tracked per watcher.
CREATE TABLE IF NOT EXISTS source_status (
  source         TEXT PRIMARY KEY,
  state          TEXT NOT NULL CHECK (state IN ('connecting','ok','error','disabled')),
  last_event_at  INTEGER,
  last_error     TEXT,
  updated_at     INTEGER NOT NULL
);
