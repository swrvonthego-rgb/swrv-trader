// SWRV Trader — Signal Engine
// Strategy: RSI + EMA momentum. Simple, proven, low-risk entry criteria.

/**
 * Calculate RSI (Relative Strength Index)
 * RSI < 35 = oversold (potential buy)
 * RSI > 65 = overbought (potential sell)
 */
export function calcRSI(closes, period = 14) {
  if (closes.length < period + 1) return null;

  let gains = 0, losses = 0;
  for (let i = 1; i <= period; i++) {
    const diff = closes[i] - closes[i - 1];
    if (diff >= 0) gains += diff;
    else losses += Math.abs(diff);
  }

  let avgGain = gains / period;
  let avgLoss = losses / period;

  for (let i = period + 1; i < closes.length; i++) {
    const diff = closes[i] - closes[i - 1];
    const gain = diff >= 0 ? diff : 0;
    const loss = diff < 0 ? Math.abs(diff) : 0;
    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;
  }

  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return 100 - 100 / (1 + rs);
}

/**
 * Calculate EMA (Exponential Moving Average)
 */
export function calcEMA(closes, period) {
  if (closes.length < period) return null;
  const k = 2 / (period + 1);
  let ema = closes.slice(0, period).reduce((a, b) => a + b, 0) / period;
  for (let i = period; i < closes.length; i++) {
    ema = closes[i] * k + ema * (1 - k);
  }
  return ema;
}

/**
 * Calculate VWAP (Volume Weighted Average Price) — intraday quality filter
 */
export function calcVWAP(bars) {
  let cumTPV = 0, cumVol = 0;
  for (const bar of bars) {
    const tp = (bar.h + bar.l + bar.c) / 3;
    cumTPV += tp * bar.v;
    cumVol += bar.v;
  }
  return cumVol > 0 ? cumTPV / cumVol : null;
}

/**
 * Analyze a symbol's bars and return a signal
 * Returns: { signal: "BUY"|"SELL"|"HOLD", reason, price, rsi, ema9, ema21, vwap }
 */
export function analyzeSymbol(symbol, bars) {
  if (!bars || bars.length < 22) {
    return { signal: "HOLD", reason: "Not enough data", symbol };
  }

  const closes = bars.map((b) => b.c);
  const currentPrice = closes[closes.length - 1];
  const currentBar = bars[bars.length - 1];

  const rsi = calcRSI(closes);
  const ema9 = calcEMA(closes, 9);
  const ema21 = calcEMA(closes, 21);
  const vwap = calcVWAP(bars);

  if (!rsi || !ema9 || !ema21) {
    return { signal: "HOLD", reason: "Indicator calculation failed", symbol };
  }

  // Volume check — only trade if volume is decent (above average)
  const avgVolume = bars.slice(-10).reduce((a, b) => a + b.v, 0) / 10;
  const currentVolume = currentBar.v;
  const volumeOk = currentVolume >= avgVolume * 0.8;

  // BUY conditions: RSI recovering from oversold + short EMA crossed above long EMA + price above VWAP
  const rsiBuy = rsi > 32 && rsi < 55;       // RSI coming up from oversold zone
  const emaBullish = ema9 > ema21;            // short term trending up
  const priceAboveVWAP = vwap ? currentPrice > vwap : true;
  const notOverextended = rsi < 65;           // don't chase

  // SELL conditions: RSI overbought or EMA bearish cross
  const rsiSell = rsi > 68;
  const emaBearish = ema9 < ema21;

  if (rsiBuy && emaBullish && priceAboveVWAP && volumeOk && notOverextended) {
    return {
      signal: "BUY",
      reason: `RSI ${rsi.toFixed(1)} recovering, EMA9 > EMA21, price above VWAP, volume OK`,
      symbol,
      price: currentPrice,
      rsi: rsi.toFixed(2),
      ema9: ema9.toFixed(2),
      ema21: ema21.toFixed(2),
      vwap: vwap ? vwap.toFixed(2) : null,
    };
  }

  if (rsiSell || emaBearish) {
    return {
      signal: "SELL",
      reason: `RSI ${rsi.toFixed(1)} overbought or bearish EMA cross`,
      symbol,
      price: currentPrice,
      rsi: rsi.toFixed(2),
      ema9: ema9.toFixed(2),
      ema21: ema21.toFixed(2),
      vwap: vwap ? vwap.toFixed(2) : null,
    };
  }

  return {
    signal: "HOLD",
    reason: `RSI ${rsi.toFixed(1)}, no clear signal`,
    symbol,
    price: currentPrice,
    rsi: rsi.toFixed(2),
    ema9: ema9.toFixed(2),
    ema21: ema21.toFixed(2),
    vwap: vwap ? vwap.toFixed(2) : null,
  };
}
