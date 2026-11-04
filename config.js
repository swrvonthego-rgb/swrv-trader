// SWRV Trader — Config
// Set these as environment variables / Cloudflare secrets. Never hardcode.

export const CONFIG = {
  // Alpaca paper trading (free — paper.alpaca.markets)
  ALPACA_API_KEY: globalThis.ALPACA_API_KEY || process.env.ALPACA_API_KEY,
  ALPACA_SECRET_KEY: globalThis.ALPACA_SECRET_KEY || process.env.ALPACA_SECRET_KEY,
  ALPACA_BASE_URL: "https://paper-api.alpaca.markets", // switch to live-api.alpaca.markets when ready

  // Risk rules — protect the account
  MAX_POSITION_PCT: 0.10,   // never put more than 10% of account in one trade
  MAX_OPEN_POSITIONS: 5,    // max 5 trades open at once
  STOP_LOSS_PCT: 0.02,      // auto exit if position drops 2%
  TAKE_PROFIT_PCT: 0.04,    // auto exit at 4% gain (2:1 reward/risk)
  MIN_PRICE: 5,             // ignore penny stocks under $5
  MAX_PRICE: 500,           // keep it manageable

  // Market hours (Eastern — Alpaca uses UTC internally)
  MARKET_OPEN_HOUR: 9,
  MARKET_OPEN_MIN: 35,      // 5 min after open — avoid open chaos
  MARKET_CLOSE_HOUR: 15,
  MARKET_CLOSE_MIN: 45,     // stop 15 min before close

  // Watchlist — solid liquid stocks the scanner will scan
  WATCHLIST: [
    "AAPL", "MSFT", "GOOGL", "AMZN", "NVDA",
    "META", "TSLA", "AMD", "SPY", "QQQ",
    "BAC", "JPM", "UBER", "SNAP", "COIN"
  ],
};
