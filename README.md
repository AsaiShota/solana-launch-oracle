# solana-launch-oracle

> **x402-enabled Solana token launch detection API.** Monitors Pump.fun, Raydium AMM V4, Raydium CPMM, and PumpSwap in real time and exposes the data via paid HTTP endpoints. Built for AI agents.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node 20+](https://img.shields.io/badge/node-%3E%3D20-blue.svg)](https://nodejs.org/)

---

## What this is

`solana-launch-oracle` watches the Solana mainnet for newly created tokens / pools across the four most active venues:

| Source         | Program ID                                       | What we capture                          |
| -------------- | ------------------------------------------------ | ---------------------------------------- |
| Pump.fun       | `6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P` | new bonding-curve mints                  |
| Raydium AMM V4 | `675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8` | `initialize2` pool creation              |
| Raydium CPMM   | `CPMMoo8L3F4NbTegBCKVNunggL7H1ZpdTHKxQB5qKP1C` | new CPMM pools                           |
| PumpSwap       | `pAMMBay6oceH9fJKBRHGP5D4bD4sWpmSwMn52FMfXEA` | tokens graduating from pump.fun curves   |

Detections are written to a local SQLite store (24 h retention) and served via a [Hono](https://hono.dev) HTTP API. Paid endpoints are gated by [**x402**](https://github.com/coinbase/x402) (HTTP 402 Payment Required, USDC on Base mainnet, settled by the Coinbase CDP facilitator) so AI agents can pay-per-call without an API key.

> **Disclaimer:** This service performs **detection only**. It is **not** financial advice. Newly minted tokens are extremely high risk; many are scams. Use the included `risk_score` and AI summary as one signal among many, never as a buy signal.

## Endpoints

| Method | Path                       | Price       | Description                                                  |
| ------ | -------------------------- | ----------- | ------------------------------------------------------------ |
| GET    | `/health`                  | free        | Service health                                               |
| GET    | `/sources/status`          | free        | Watcher connection state (per source)                        |
| GET    | `/launches/recent`         | **$0.001**  | List recent launches. Query: `since` (min, ≤60), `source` (`pumpfun`/`raydium-v4`/`raydium-cpmm`/`pumpswap`/`all`), `limit` (≤100) |
| GET    | `/launches/:mint`          | **$0.005**  | Launch detail + AI summary (EN/JA) + `risk_score` 0–100      |

### Response schema (`/launches/recent`)

```json
{
  "since_minutes": 10,
  "source": "all",
  "count": 2,
  "items": [
    {
      "mint": "...",
      "source": "pumpfun",
      "signature": "...",
      "name": "Token Name",
      "symbol": "TKN",
      "metadata_uri": "https://...",
      "creator": "...",
      "initial_liquidity_sol": 4.21,
      "pool_address": "...",
      "created_at": "2026-04-27T12:34:56.000Z"
    }
  ]
}
```

### Paying with x402 (for AI agents)

Without payment:

```bash
$ curl -i https://your-host/launches/recent
HTTP/1.1 402 Payment Required
{
  "x402Version": 1,
  "accepts": [{
    "scheme": "exact",
    "price": "$0.001",
    "network": "eip155:8453",
    "payTo": "0xYourReceiver",
    "resource": "GET /launches/recent"
  }]
}
```

With an `X-PAYMENT` header (signed payment payload — see [x402 docs](https://docs.cdp.coinbase.com/x402/welcome)):

```bash
$ curl -H "X-PAYMENT: <base64 payload>" https://your-host/launches/recent
HTTP/1.1 200 OK
X-PAYMENT-RESPONSE: <facilitator settlement receipt>
{ ... launches ... }
```

Most agent frameworks can use the official x402 client libraries, e.g.:

```ts
import { withPayment } from "@x402/fetch";
const fetchPaid = withPayment(fetch, { wallet });
const r = await fetchPaid("https://your-host/launches/recent");
```

## Quick start (self-hosted)

```bash
git clone https://github.com/YOUR_USER/solana-launch-oracle
cd solana-launch-oracle
cp .env.example .env
# fill in HELIUS_API_KEY, ANTHROPIC_API_KEY, X402_RECEIVER_ADDRESS
docker compose -f docker/docker-compose.yml up -d
curl http://localhost:3000/health
```

Native (no Docker):

```bash
npm install
cp .env.example .env   # edit
npm run build
npm start
```

## Required env vars

| Var                       | Purpose                                                 |
| ------------------------- | ------------------------------------------------------- |
| `HELIUS_API_KEY`          | Helius account key (powers WS + HTTP RPC)               |
| `HELIUS_WSS_URL`          | Helius WebSocket URL (defaults from API key)            |
| `ANTHROPIC_API_KEY`       | Claude API key (used for `/launches/:mint` summaries)   |
| `ANTHROPIC_MODEL`         | Default `claude-haiku-4-5-20251001`                     |
| `X402_RECEIVER_ADDRESS`   | Your EVM address to receive USDC payments on Base       |
| `X402_FACILITATOR_URL`    | Default Coinbase CDP facilitator                        |
| `X402_NETWORK`            | `base` (= `eip155:8453`) or `base-sepolia`              |
| `PORT`                    | Default `3000`                                          |
| `DATABASE_PATH`           | SQLite path (default `./data/launches.db`)              |
| `ENABLE_PUMPFUN` etc.     | `true`/`false` per watcher                              |

## Architecture

```
              ┌──────────────────────┐
   Solana ──► │  WebSocket watchers  │ ──► SQLite (24 h)
              │  (4 program IDs)     │
              └──────────────────────┘
                          │
                          ▼
                  ┌───────────────┐       ┌───────────────────┐
   AI agent ────► │  Hono API     │ ────► │ Coinbase CDP x402 │
   (curl/SDK)     │  + x402 mw    │       │   facilitator     │
                  └───────────────┘       └───────────────────┘
                          │
                          ▼
                ┌──────────────────┐
                │ Anthropic Claude │  (only on /launches/:mint)
                │  haiku-4-5       │
                └──────────────────┘
```

## License

MIT — see [LICENSE](./LICENSE).

---

# 日本語版

## 概要

Solanaメインネット上で新しく登場するトークン/プール（**Pump.fun / Raydium V4 / Raydium CPMM / PumpSwap**）をリアルタイムで検出し、HTTP APIとして提供するサービスです。

支払いは [**x402**](https://github.com/coinbase/x402) プロトコル（**Base USDC**、Coinbase CDP facilitator）に準拠しているため、AIエージェントが APIキー無しで「払って・取得」できます。

> **免責**: 本サービスは**検出のみ**を行います。投資助言ではありません。新規トークンは詐欺リスクが極めて高く、`risk_score` や AI 要約はあくまで参考値です。

## エンドポイント

| Method | Path                | 価格        | 内容                                                                                                                          |
| ------ | ------------------- | ----------- | ----------------------------------------------------------------------------------------------------------------------------- |
| GET    | `/health`           | 無料        | ヘルスチェック                                                                                                                |
| GET    | `/sources/status`   | 無料        | 4つのwatcherの接続状態                                                                                                        |
| GET    | `/launches/recent`  | **$0.001**  | 直近のlaunch一覧。`since`（分、最大60）、`source`（`pumpfun`/`raydium-v4`/`raydium-cpmm`/`pumpswap`/`all`）、`limit`（最大100） |
| GET    | `/launches/:mint`   | **$0.005**  | 詳細 + AI要約（EN/JA）+ `risk_score` 0–100                                                                                    |

## クイックスタート（セルフホスト）

```bash
git clone https://github.com/YOUR_USER/solana-launch-oracle
cd solana-launch-oracle
cp .env.example .env
# HELIUS_API_KEY、ANTHROPIC_API_KEY、X402_RECEIVER_ADDRESS を埋める
docker compose -f docker/docker-compose.yml up -d
curl http://localhost:3000/health
```

## ライセンス

MIT
