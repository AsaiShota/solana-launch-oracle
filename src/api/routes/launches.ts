import { Hono } from "hono";
import { listRecent, type LaunchSource, type LaunchRow } from "../../db/client";
import { getOrComputeSummary } from "../../ai/summarizer";

const router = new Hono();

const ALLOWED_SOURCES: LaunchSource[] = ["pumpfun", "raydium-v4", "raydium-cpmm", "pumpswap"];

interface RecentResponseItem {
  mint: string;
  source: LaunchSource;
  signature: string | null;
  name: string | null;
  symbol: string | null;
  metadata_uri: string | null;
  creator: string | null;
  initial_liquidity_sol: number | null;
  pool_address: string | null;
  created_at: string; // ISO8601
}

function rowToPublic(row: LaunchRow): RecentResponseItem {
  return {
    mint: row.mint,
    source: row.source,
    signature: row.signature,
    name: row.name,
    symbol: row.symbol,
    metadata_uri: row.metadata_uri,
    creator: row.creator,
    initial_liquidity_sol: row.initial_liquidity_sol,
    pool_address: row.pool_address,
    created_at: new Date(row.created_at).toISOString(),
  };
}

router.get("/recent", (c) => {
  const sinceMin = clamp(parseInt(c.req.query("since") ?? "10", 10) || 10, 1, 60);
  const limit = clamp(parseInt(c.req.query("limit") ?? "20", 10) || 20, 1, 100);
  const sourceParam = c.req.query("source");
  let source: LaunchSource | undefined;
  if (sourceParam && sourceParam !== "all") {
    if (!ALLOWED_SOURCES.includes(sourceParam as LaunchSource)) {
      return c.json({ error: `invalid source: ${sourceParam}`, allowed: [...ALLOWED_SOURCES, "all"] }, 400);
    }
    source = sourceParam as LaunchSource;
  }

  const sinceMs = Date.now() - sinceMin * 60_000;
  const rows = listRecent({ sinceMs, source, limit });

  return c.json({
    since_minutes: sinceMin,
    source: sourceParam ?? "all",
    count: rows.length,
    items: rows.map(rowToPublic),
  });
});

router.get("/:mint", async (c) => {
  const mint = c.req.param("mint");
  if (!mint || mint.length < 32 || mint.length > 50) {
    return c.json({ error: "invalid mint" }, 400);
  }
  const result = await getOrComputeSummary(mint);
  if (!result) {
    return c.json({ error: "not found" }, 404);
  }
  const { row, summary } = result;
  return c.json({
    ...rowToPublic(row),
    ai_summary: summary
      ? { en: summary.en, ja: summary.ja }
      : { en: null, ja: null },
    risk_score: summary?.riskScore ?? null,
    ai_computed_at: row.ai_computed_at ? new Date(row.ai_computed_at).toISOString() : null,
  });
});

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

export default router;
