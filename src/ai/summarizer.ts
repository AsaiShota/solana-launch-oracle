import Anthropic from "@anthropic-ai/sdk";
import { config } from "../config";
import { logger } from "../logger";
import {
  getLaunchByMint,
  setAiSummary,
  type LaunchRow,
  type LaunchSource,
} from "../db/client";

let client: Anthropic | null = null;

function getClient(): Anthropic | null {
  if (!config.anthropic.apiKey) return null;
  if (!client) client = new Anthropic({ apiKey: config.anthropic.apiKey });
  return client;
}

export interface SummaryResult {
  en: string;
  ja: string;
  riskScore: number;
}

interface PromptInput {
  mint: string;
  source: LaunchSource;
  symbol: string | null;
  name: string | null;
  metadataUri: string | null;
  initialLiquiditySol: number | null;
  creator: string | null;
  ageMinutes: number;
}

function buildPrompt(input: PromptInput): string {
  return `You are a crypto risk analyst summarizing a brand-new Solana token launch.

Token data:
- Mint: ${input.mint}
- Detected on: ${input.source}
- Symbol: ${input.symbol ?? "(none)"}
- Name: ${input.name ?? "(none)"}
- Metadata URI: ${input.metadataUri ?? "(none)"}
- Initial liquidity (SOL): ${input.initialLiquiditySol ?? "unknown"}
- Creator wallet: ${input.creator ?? "(unknown)"}
- Age since detection: ${input.ageMinutes.toFixed(1)} min

Reply with a JSON object exactly matching this schema:
{
  "en": "<one or two factual English sentences. NO investment advice.>",
  "ja": "<同じ内容を日本語で1〜2文。投資助言は書かない。>",
  "risk_score": <integer 0-100; 0=highest confidence legit, 100=clear scam signals>
}

Rules:
- Do NOT recommend buying/selling.
- Be concrete: cite low liquidity, anonymous creator, recycled symbols, etc.
- If data is sparse, say so plainly and pick a moderate risk_score (50-70).
- Output ONLY the JSON object, no surrounding text.`;
}

function safeParse(text: string): SummaryResult | null {
  // Strip code fences if any.
  const cleaned = text
    .trim()
    .replace(/^```(?:json)?/i, "")
    .replace(/```$/i, "")
    .trim();
  try {
    const obj = JSON.parse(cleaned) as { en?: string; ja?: string; risk_score?: number };
    if (typeof obj.en !== "string" || typeof obj.ja !== "string" || typeof obj.risk_score !== "number") {
      return null;
    }
    const score = Math.max(0, Math.min(100, Math.round(obj.risk_score)));
    return { en: obj.en.trim(), ja: obj.ja.trim(), riskScore: score };
  } catch {
    return null;
  }
}

export async function summarizeLaunch(row: LaunchRow): Promise<SummaryResult | null> {
  const c = getClient();
  if (!c) {
    logger.warn("ANTHROPIC_API_KEY not set; skipping AI summary");
    return null;
  }

  const ageMin = (Date.now() - row.created_at) / 60_000;
  const prompt = buildPrompt({
    mint: row.mint,
    source: row.source,
    symbol: row.symbol,
    name: row.name,
    metadataUri: row.metadata_uri,
    initialLiquiditySol: row.initial_liquidity_sol,
    creator: row.creator,
    ageMinutes: ageMin,
  });

  try {
    const resp = await c.messages.create({
      model: config.anthropic.model,
      max_tokens: 400,
      messages: [{ role: "user", content: prompt }],
    });
    const text = resp.content
      .filter((b) => b.type === "text")
      .map((b: any) => b.text as string)
      .join("\n");
    const parsed = safeParse(text);
    if (!parsed) {
      logger.warn(`AI summary unparsable for ${row.mint}: ${text.slice(0, 200)}`);
      return null;
    }
    return parsed;
  } catch (err) {
    logger.error(`AI summary failed for ${row.mint}`, err);
    return null;
  }
}

/**
 * Returns an existing summary if one is already cached on the row, else
 * computes one (against Claude) and persists it. Both EN/JA + risk_score.
 *
 * Caller is the GET /launches/:mint route; the x402 fee covers the LLM cost.
 */
export async function getOrComputeSummary(mint: string): Promise<{
  row: LaunchRow;
  summary: SummaryResult | null;
} | null> {
  const rows = getLaunchByMint(mint);
  if (rows.length === 0) return null;
  const row = rows[0];

  if (row.ai_summary_en && row.ai_summary_ja && row.risk_score !== null) {
    return {
      row,
      summary: { en: row.ai_summary_en, ja: row.ai_summary_ja, riskScore: row.risk_score },
    };
  }

  const summary = await summarizeLaunch(row);
  if (summary) {
    setAiSummary(row.mint, row.source, summary.en, summary.ja, summary.riskScore);
    return { row: { ...row, ai_summary_en: summary.en, ai_summary_ja: summary.ja, risk_score: summary.riskScore }, summary };
  }
  return { row, summary: null };
}
