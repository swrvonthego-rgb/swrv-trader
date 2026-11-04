// SWRV Trader — Main Bot Loop
// Designed to run as a long-running agent (Freebuff / Node / Cloudflare Worker)

import { CONFIG } from "./config.js";
import {
  getAccount,
  getPositions,
  getOpenOrders,
  placeOrder,
  closePosition,
  getClock,
  getBars,
} from "./alpaca.js";
import { analyzeSymbol } from "./signals.js";

// Simple logger — replace with your logging service if needed
function log(level, msg, data = {}) {
  const entry = {
    ts: new Date().toISOString(),
    level,
    msg,
    ...data,
  };
  console.log(JSON.stringify(entry));
  return entry;
}

// Check if market is open and we're in our safe trading window
async function isInTradingWindow() {
  const clock = await getClock();
  if (!clock.is_open) return false;

  const now = new Date(clock.timestamp);
  // Convert to Eastern time offset
  const etHour = now.getUTCHours() - 5; // rough EST (not DST-aware — Alpaca handles this)
  const etMin = now.getUTCMinutes();
  const etTotal = etHour * 60 + etMin;

  const openTime = CONFIG.MARKET_OPEN_HOUR * 60 + CONFIG.MARKET_OPEN_MIN;
  const closeTime = CONFIG.MARKET_CLOSE_HOUR * 60 + CONFIG.MARKET_CLOSE_MIN;

  return etTotal >= openTime && etTotal <= closeTime;
}

// Calculate position size based on account equity and risk rules
function calcQty(price, equity) {
  const maxDollars = equity * CONFIG.MAX_POSITION_PCT;
  const qty = Math.floor(maxDollars / price);
  return qty >= 1 ? qty : 0;
}

// Core trading logic — runs every cycle
export async function runTradingCycle(logStore = null) {
  const logs = [];
  const addLog = (level, msg, data) => {
    const entry = log(level, msg, data);
    logs.push(entry);
    if (logStore) logStore.push(entry);
  };

  try {
    // 1. Check if we should be trading right now
    const inWindow = await isInTradingWindow();
    if (!inWindow) {
      addLog("info", "Outside trading window — skipping cycle");
      return { action: "skipped", logs };
    }

    // 2. Get account state
    const account = await getAccount();
    if (account.trading_blocked || account.account_blocked) {
      addLog("warn", "Account blocked — skipping cycle");
      return { action: "blocked", logs };
    }

    const equity = parseFloat(account.equity);
    const buyingPower = parseFloat(account.buying_power);
    addLog("info", "Account state", { equity, buyingPower });

    // 3. Get current positions + open orders
    const positions = await getPositions();
    const openOrders = await getOpenOrders();
    const positionSymbols = new Set(positions.map((p) => p.symbol));
    const orderSymbols = new Set(openOrders.map((o) => o.symbol));

    // 4. Check existing positions for stop loss / take profit (belt & suspenders — Alpaca bracket orders handle this automatically)
    for (const pos of positions) {
      const pnlPct = parseFloat(pos.unrealized_plpc);
      if (pnlPct <= -CONFIG.STOP_LOSS_PCT) {
        addLog("warn", "Emergency stop loss triggered", { symbol: pos.symbol, pnlPct });
        await closePosition(pos.symbol);
      }
    }

    // 5. Skip scanning if at max positions
    if (positions.length >= CONFIG.MAX_OPEN_POSITIONS) {
      addLog("info", "Max positions reached — holding", { count: positions.length });
      return { action: "holding", logs };
    }

    // 6. Scan watchlist
    const eligibleSymbols = CONFIG.WATCHLIST.filter(
      (s) => !positionSymbols.has(s) && !orderSymbols.has(s)
    );

    if (eligibleSymbols.length === 0) {
      addLog("info", "No eligible symbols to scan");
      return { action: "no_candidates", logs };
    }

    // Fetch bars in batches of 10 (API limit)
    const batchSize = 10;
    const allSignals = [];

    for (let i = 0; i < eligibleSymbols.length; i += batchSize) {
      const batch = eligibleSymbols.slice(i, i + batchSize);
      const barsMap = await getBars(batch, "5Min", 30);

      for (const symbol of batch) {
        const bars = barsMap[symbol];
        const signal = analyzeSymbol(symbol, bars);
        if (signal.signal !== "HOLD") {
          allSignals.push(signal);
          addLog("info", `Signal: ${signal.signal}`, { symbol, reason: signal.reason });
        }
      }
    }

    // 7. Execute BUY signals (best RSI opportunity first)
    const buySignals = allSignals
      .filter((s) => s.signal === "BUY")
      .sort((a, b) => parseFloat(a.rsi) - parseFloat(b.rsi)); // lowest RSI = most oversold = best entry

    for (const sig of buySignals) {
      if (positions.length >= CONFIG.MAX_OPEN_POSITIONS) break;

      const price = parseFloat(sig.price);
      if (price < CONFIG.MIN_PRICE || price > CONFIG.MAX_PRICE) continue;

      const qty = calcQty(price, equity);
      if (qty < 1) {
        addLog("warn", "Not enough buying power for position", { symbol: sig.symbol, price, equity });
        continue;
      }

      const stopPrice = price * (1 - CONFIG.STOP_LOSS_PCT);
      const takeProfitPrice = price * (1 + CONFIG.TAKE_PROFIT_PCT);

      try {
        const order = await placeOrder({
          symbol: sig.symbol,
          qty,
          side: "buy",
          stop_loss_price: stopPrice,
          take_profit_price: takeProfitPrice,
        });

        addLog("info", "Order placed", {
          symbol: sig.symbol,
          qty,
          price,
          stopPrice: stopPrice.toFixed(2),
          takeProfitPrice: takeProfitPrice.toFixed(2),
          orderId: order.id,
        });
      } catch (err) {
        addLog("error", "Order failed", { symbol: sig.symbol, error: err.message });
      }
    }

    return { action: "cycle_complete", signals: allSignals.length, logs };
  } catch (err) {
    log("error", "Cycle crashed", { error: err.message });
    return { action: "error", error: err.message, logs };
  }
}
