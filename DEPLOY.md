# Deploy guide

Step-by-step for going from this repo on disk → live, paid Solana launch API.

This file exists because the local environment didn't have the `gh` CLI or
Railway CLI installed, so the "GitHub push" and "deploy" steps need a few
keystrokes from you. Everything else is automated.

---

## 0. Prerequisites you'll need

| Thing | Where to get it | Why |
|---|---|---|
| GitHub account | github.com | host the public repo |
| Railway account (or Render) | railway.com | run the container |
| Helius API key | helius.dev | Solana WebSocket + RPC |
| Anthropic API key | console.anthropic.com | AI summaries |
| EVM wallet address | any Base wallet (MetaMask, Coinbase Wallet) | receive USDC payments |

---

## 1. Create the GitHub repo and push

The local repo is already initialized and committed. You just need to attach a remote.

**Option A — using `gh` (install it first if needed):**

```bash
cd C:/Users/liens/Desktop/Dev/solana-launch-oracle
gh auth login           # one time
gh repo create solana-launch-oracle --public --source=. --remote=origin --push
```

**Option B — manually via the GitHub web UI:**

1. Go to <https://github.com/new>, name it `solana-launch-oracle`, **Public**, no README/license/gitignore (we already have them).
2. Run:

```bash
cd C:/Users/liens/Desktop/Dev/solana-launch-oracle
git remote add origin https://github.com/<YOUR_USER>/solana-launch-oracle.git
git branch -M main
git push -u origin main
```

After push, update the badge URLs in `README.md` and `MARKETPLACE_LISTING.md` (search-replace `YOUR_USER`).

---

## 2. Deploy to Railway

### 2a. Via the Railway web UI (recommended for first deploy)

1. Go to <https://railway.com/new>.
2. **Deploy from GitHub repo** → pick `solana-launch-oracle`.
3. Railway will auto-detect `railway.json` and use `docker/Dockerfile`.
4. In the project's **Variables** tab, paste:

   ```
   HELIUS_API_KEY=<your key>
   HELIUS_WSS_URL=wss://mainnet.helius-rpc.com/?api-key=<your key>
   ANTHROPIC_API_KEY=<your key>
   ANTHROPIC_MODEL=claude-haiku-4-5-20251001
   X402_RECEIVER_ADDRESS=<your 0x... Base address>
   X402_FACILITATOR_URL=https://api.cdp.coinbase.com/platform/v2/x402
   X402_NETWORK=base
   PORT=3000
   DATABASE_PATH=/app/data/launches.db
   ENABLE_PUMPFUN=true
   ENABLE_RAYDIUM_V4=true
   ENABLE_RAYDIUM_CPMM=true
   ENABLE_PUMPSWAP=true
   LOG_LEVEL=info
   ```

5. **Settings → Volumes** → mount a volume at `/app/data` (so the SQLite db survives restarts).
6. **Settings → Networking** → enable a public domain. Railway gives you `https://<name>.up.railway.app`.
7. Wait for the first build (~3–5 min). Watch logs.
8. Test:

   ```bash
   curl https://<name>.up.railway.app/health
   curl https://<name>.up.railway.app/sources/status
   curl -i https://<name>.up.railway.app/launches/recent
   # → expect HTTP/1.1 402 Payment Required
   ```

### 2b. Via the Railway CLI (if you prefer)

```bash
npm i -g @railway/cli
railway login
cd C:/Users/liens/Desktop/Dev/solana-launch-oracle
railway init           # link to a new project
railway up             # deploy from current dir
railway variables set HELIUS_API_KEY=...
railway variables set ANTHROPIC_API_KEY=...
# ... etc
railway domain         # generate the public URL
```

---

## 3. Render (fallback)

If Railway gives you trouble:

1. <https://dashboard.render.com/new/web> → **Build from Git Repository**.
2. Pick the GitHub repo.
3. **Runtime: Docker**, **Dockerfile path: `docker/Dockerfile`**.
4. **Disk** → 1 GB at `/app/data`.
5. Add the same env vars as in 2a above.
6. Deploy. Render gives you `https://<name>.onrender.com`.

---

## 4. Smoke test against the live URL

```bash
URL=https://<your-deployed-host>

curl $URL/health
# {"status":"ok",...}

curl $URL/sources/status
# {"sources":[{"source":"pumpfun","state":"ok",...}]}

# Without payment — should return 402
curl -i $URL/launches/recent
# HTTP/1.1 402 Payment Required
# {"x402Version":1,"accepts":[{"price":"$0.001",...}]}

# After waiting 1–2 minutes for watchers to capture some data:
curl $URL/launches/recent  | jq
```

---

## 5. List on agentic.market

Open `MARKETPLACE_LISTING.md`, replace the TODOs (public URL, GitHub URL, contact),
then submit at <https://agentic.market>.

---

## 6. Things to watch in production

- **`/sources/status`** — if any watcher shows `state: "error"` for >5 min, your
  Helius key may be rate-limited or the WS URL is wrong.
- **DB size** — capped at 24 h of launches; usually <50 MB.
- **AI cost** — `/launches/:mint` calls Claude haiku-4-5 once per unique mint
  then caches. At Apr 2026 prices that's ≈ $0.001 per call, so the $0.005 fee
  covers 5× cost.
- **x402 receiver address** — double-check this is *your* address before
  taking real traffic. Misconfigured payouts cannot be reversed.
