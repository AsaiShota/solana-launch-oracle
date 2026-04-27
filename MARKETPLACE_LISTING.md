# Agentic.market listing — solana-launch-oracle

Copy-paste this when registering at <https://agentic.market>.

---

**Service name**
solana-launch-oracle

**Category**
Crypto / On-chain Data / Solana

**Tagline (EN)**
Real-time Solana token launch detection — Pump.fun, Raydium V4 / CPMM, PumpSwap. Pay per call in USDC via x402.

**Tagline (JA)**
Solanaの新規トークン発射をリアルタイム検出。Pump.fun / Raydium / PumpSwap対応。x402（Base USDC）で従量課金。

**Description (EN)**
A live HTTP API that surfaces brand-new Solana SPL tokens within seconds of mint. We monitor Pump.fun bonding-curve creations, Raydium AMM V4 `initialize2`, Raydium CPMM, and PumpSwap pool creations over Helius WebSocket and write each detection to a 24-hour rolling store. AI agents call:

- `GET /launches/recent` ($0.001) — fresh launches in the last N minutes
- `GET /launches/:mint` ($0.005) — full detail + bilingual AI summary (Claude haiku-4-5) + risk score 0–100

Payments are settled in USDC on Base mainnet via the Coinbase CDP x402 facilitator. No signup, no API key — just pay and call.

**Description (JA)**
Solanaの新規SPLトークンを mint 直後（数秒以内）に検出して提供するライブAPIです。Pump.fun のボンディングカーブ作成、Raydium AMM V4 の `initialize2`、Raydium CPMM、PumpSwap のプール作成を Helius WebSocket で監視し、24時間ローリングのストアに記録します。

AIエージェント向けエンドポイント:
- `GET /launches/recent` ($0.001) — 直近 N 分のlaunch一覧
- `GET /launches/:mint` ($0.005) — 詳細 + 英日AI要約（Claude haiku-4-5）+ リスクスコア 0–100

支払いは Base メインネットの USDC を Coinbase CDP x402 facilitator 経由で決済。サインアップ不要・APIキー不要。

**Endpoints**

| Method | Path               | Price (USDC) | Notes                                  |
| ------ | ------------------ | ------------ | -------------------------------------- |
| GET    | /health            | free         | service health                         |
| GET    | /sources/status    | free         | per-watcher connection state           |
| GET    | /launches/recent   | 0.001        | query: `since`, `source`, `limit`      |
| GET    | /launches/:mint    | 0.005        | includes EN+JA summary + risk_score    |

**x402 details**
- Network: Base mainnet (`eip155:8453`)
- Asset: USDC
- Facilitator: `https://api.cdp.coinbase.com/platform/v2/x402`
- Scheme: `exact`

**Tags**
`solana` `pump.fun` `raydium` `pumpswap` `meme-coin` `dex` `token-launch` `x402` `usdc` `base` `ai-agent` `crypto-data`

**Public URL**
<TODO: fill after Railway deploy>

**Source code**
<TODO: GitHub URL after push>

**License**
MIT

**Contact**
<TODO: email or X handle>
