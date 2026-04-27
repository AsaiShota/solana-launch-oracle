# Agentic.market listing  Esolana-launch-oracle

Copy-paste this when registering at <https://agentic.market>.

---

**Service name**
solana-launch-oracle

**Category**
Crypto / On-chain Data / Solana

**Tagline (EN)**
Real-time Solana token launch detection  EPump.fun, Raydium V4 / CPMM, PumpSwap. Pay per call in USDC via x402.

**Tagline (JA)**
Solanaの新規トークン発封E��リアルタイム検�E。Pump.fun / Raydium / PumpSwap対応。x402�E�Ease USDC�E�で従量課金、E
**Description (EN)**
A live HTTP API that surfaces brand-new Solana SPL tokens within seconds of mint. We monitor Pump.fun bonding-curve creations, Raydium AMM V4 `initialize2`, Raydium CPMM, and PumpSwap pool creations over Helius WebSocket and write each detection to a 24-hour rolling store. AI agents call:

- `GET /launches/recent` ($0.001)  Efresh launches in the last N minutes
- `GET /launches/:mint` ($0.005)  Efull detail + bilingual AI summary (Claude haiku-4-5) + risk score 0 E00

Payments are settled in USDC on Base mainnet via the Coinbase CDP x402 facilitator. No signup, no API key  Ejust pay and call.

**Description (JA)**
Solanaの新規SPLト�EクンめEmint 直後（数秒以冁E��に検�Eして提供するライブAPIです。Pump.fun のボンチE��ングカーブ作�E、Raydium AMM V4 の `initialize2`、Raydium CPMM、PumpSwap のプ�Eル作�EめEHelius WebSocket で監視し、E4時間ローリングのストアに記録します、E
AIエージェント向けエンド�EインチE
- `GET /launches/recent` ($0.001)  E直迁EN 刁E�Elaunch一覧
- `GET /launches/:mint` ($0.005)  E詳細 + 英日AI要紁E��Elaude haiku-4-5�E�E リスクスコア 0 E00

支払いは Base メインネット�E USDC めECoinbase CDP x402 facilitator 経由で決済。サインアチE�E不要�EAPIキー不要、E
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
https://oracle-production-d5ba.up.railway.app

**Source code**
https://github.com/AsaiShota/solana-launch-oracle

**License**
MIT

**Contact**
lien.studio.akiyama@gmail.com
