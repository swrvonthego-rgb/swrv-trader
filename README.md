# SWRV Trader 🤖

**AI-powered day trading bot. RSI + EMA momentum strategy. Paper trades via Alpaca.**

---

## Setup (10 minutes)

### 1. Get Alpaca paper trading keys (free)
1. Go to [alpaca.markets](https://alpaca.markets) → sign up free
2. Go to **Paper Trading** → **API Keys** → generate keys
3. Copy `API Key ID` and `Secret Key`

### 2. Push to GitHub
```bash
git init
git remote add origin https://github.com/YOUR_USERNAME/swrv-trader.git
git add .
git commit -m "SWRV Trader init"
git push -u origin main
```

### 3. Add GitHub Secrets
Go to your repo → **Settings → Secrets and variables → Actions** → add:
- `ALPACA_API_KEY` — your Alpaca paper key
- `ALPACA_SECRET_KEY` — your Alpaca paper secret
- `CLOUDFLARE_API_TOKEN` — from Cloudflare dashboard → My Profile → API Tokens
- `CLOUDFLARE_ACCOUNT_ID` — from Cloudflare dashboard → right sidebar

### 4. Set up Cloudflare KV + Worker
```bash
npm install -g wrangler
wrangler login
wrangler kv:namespace create SWRV_KV
# Copy the ID it gives you into wrangler.toml (replace REPLACE_WITH_YOUR_KV_NAMESPACE_ID)
wrangler secret put ALPACA_API_KEY
wrangler secret put ALPACA_SECRET_KEY
wrangler deploy
```

### 5. Run on Freebuff
1. Open freebuff.com → New Project
2. Upload this repo or paste `src/run-once.js`
3. Set env vars: `ALPACA_API_KEY`, `ALPACA_SECRET_KEY`
4. Set it to run on a loop

---

## How It Works

```
Every minute (market hours only):
  → Check if market is open + in trading window
  → Get account equity + open positions  
  → Scan watchlist for RSI + EMA signals
  → Place bracket orders (auto stop-loss + take-profit built in)
  → Log everything to KV
```

**Strategy:** RSI recovery + EMA bullish cross + price above VWAP  
**Risk per trade:** 10% of account max  
**Stop loss:** 2% below entry (auto)  
**Take profit:** 4% above entry (auto)  
**Max open positions:** 5

---

## Dashboard

After deploying to Cloudflare: `https://swrv-trader.YOUR_SUBDOMAIN.workers.dev/`

Shows: cycles run, trade signals, errors, rolling log.

---

## Going Live (when ready)

Change one line in `src/config.js`:
```js
ALPACA_BASE_URL: "https://live-api.alpaca.markets"  // was paper-api
```

---

## Architecture

```
Freebuff (long-running agent)
    ↓ runs
GitHub Actions (fallback, every 5 min)
    ↓ runs  
Cloudflare Worker (primary, every 1 min during market hours)
    ↓ calls
Alpaca Markets API (executes trades)
    ↓ stores state in
Cloudflare KV (logs, stats)
```
