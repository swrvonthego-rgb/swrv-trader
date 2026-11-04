// SWRV Trader — Alpaca API wrapper

import { CONFIG } from "./config.js";

const HEADERS = () => ({
  "APCA-API-KEY-ID": CONFIG.ALPACA_API_KEY,
  "APCA-API-SECRET-KEY": CONFIG.ALPACA_SECRET_KEY,
  "Content-Type": "application/json",
});

const DATA_URL = "https://data.alpaca.markets";

async function alpacaFetch(path, options = {}) {
  const url = `${CONFIG.ALPACA_BASE_URL}${path}`;
  const res = await fetch(url, { ...options, headers: HEADERS() });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Alpaca ${path}: ${res.status} ${err}`);
  }
  return res.json();
}

async function alpacaData(path, options = {}) {
  const url = `${DATA_URL}${path}`;
  const res = await fetch(url, { ...options, headers: HEADERS() });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`AlpacaData ${path}: ${res.status} ${err}`);
  }
  return res.json();
}

// Account
export async function getAccount() {
  return alpacaFetch("/v2/account");
}

// Positions
export async function getPositions() {
  return alpacaFetch("/v2/positions");
}

// Orders
export async function getOpenOrders() {
  return alpacaFetch("/v2/orders?status=open");
}

export async function placeOrder({ symbol, qty, side, type = "market", time_in_force = "day", stop_loss_price, take_profit_price }) {
  const body = {
    symbol,
    qty: String(qty),
    side,           // "buy" or "sell"
    type,
    time_in_force,
  };

  // Bracket order = auto stop loss + take profit built in
  if (stop_loss_price && take_profit_price) {
    body.order_class = "bracket";
    body.stop_loss = { stop_price: String(stop_loss_price.toFixed(2)) };
    body.take_profit = { limit_price: String(take_profit_price.toFixed(2)) };
  }

  return alpacaFetch("/v2/orders", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export async function closePosition(symbol) {
  return alpacaFetch(`/v2/positions/${symbol}`, { method: "DELETE" });
}

// Market clock
export async function getClock() {
  return alpacaFetch("/v2/clock");
}

// Latest bars (price data)
export async function getBars(symbols, timeframe = "5Min", limit = 20) {
  const syms = symbols.join(",");
  const data = await alpacaData(
    `/v2/stocks/bars?symbols=${syms}&timeframe=${timeframe}&limit=${limit}&feed=iex`
  );
  return data.bars || {};
}

// Latest quotes (bid/ask spread check)
export async function getSnapshots(symbols) {
  const syms = symbols.join(",");
  const data = await alpacaData(`/v2/stocks/snapshots?symbols=${syms}&feed=iex`);
  return data || {};
}
