// SWRV Trader — Cloudflare Worker
// Cron trigger fires every minute during market hours
// Stores state + logs in KV

import { runTradingCycle } from "../src/bot.js";
import { CONFIG } from "../src/config.js";

// Override CONFIG to pull from CF environment secrets
function injectSecrets(env) {
  CONFIG.ALPACA_API_KEY = env.ALPACA_API_KEY;
  CONFIG.ALPACA_SECRET_KEY = env.ALPACA_SECRET_KEY;
}

export default {
  // HTTP handler — status dashboard endpoint
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (url.pathname === "/status") {
      const lastRun = await env.SWRV_KV.get("last_run", "json");
      const tradeLog = await env.SWRV_KV.get("trade_log", "json") || [];
      const stats = await env.SWRV_KV.get("stats", "json") || { cycles: 0, trades: 0, errors: 0 };

      return new Response(
        JSON.stringify({ lastRun, stats, recentLogs: tradeLog.slice(-20) }, null, 2),
        { headers: { "Content-Type": "application/json" } }
      );
    }

    if (url.pathname === "/health") {
      return new Response("SWRV Trader running", { status: 200 });
    }

    // Dashboard HTML
    if (url.pathname === "/" || url.pathname === "/dashboard") {
      const lastRun = await env.SWRV_KV.get("last_run", "json");
      const stats = await env.SWRV_KV.get("stats", "json") || { cycles: 0, trades: 0, errors: 0 };
      const tradeLog = await env.SWRV_KV.get("trade_log", "json") || [];

      const html = buildDashboard(lastRun, stats, tradeLog);
      return new Response(html, { headers: { "Content-Type": "text/html" } });
    }

    return new Response("Not found", { status: 404 });
  },

  // Cron handler — fires on schedule
  async scheduled(event, env, ctx) {
    injectSecrets(env);

    const logs = [];
    const result = await runTradingCycle(logs);

    // Update stats
    const stats = await env.SWRV_KV.get("stats", "json") || { cycles: 0, trades: 0, errors: 0 };
    stats.cycles++;
    if (result.action === "error") stats.errors++;
    if (result.action === "cycle_complete") stats.trades += (result.signals || 0);

    // Store last run + rolling log (keep last 100 entries)
    const tradeLog = await env.SWRV_KV.get("trade_log", "json") || [];
    tradeLog.push(...logs);
    if (tradeLog.length > 100) tradeLog.splice(0, tradeLog.length - 100);

    await Promise.all([
      env.SWRV_KV.put("last_run", JSON.stringify({ ts: new Date().toISOString(), result })),
      env.SWRV_KV.put("stats", JSON.stringify(stats)),
      env.SWRV_KV.put("trade_log", JSON.stringify(tradeLog)),
    ]);

    console.log("Cycle complete:", result.action);
  },
};

function buildDashboard(lastRun, stats, tradeLog) {
  const logs = tradeLog
    .slice(-15)
    .reverse()
    .map(
      (l) =>
        `<tr class="${l.level === "error" ? "err" : l.level === "warn" ? "warn" : ""}">
          <td>${l.ts ? l.ts.replace("T", " ").replace("Z", "") : ""}</td>
          <td>${l.level?.toUpperCase() || ""}</td>
          <td>${l.msg || ""}</td>
          <td>${l.symbol || ""}</td>
        </tr>`
    )
    .join("");

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>SWRV Trader — Status</title>
<style>
  :root { --bg: #0a0a0f; --card: #13131a; --accent: #7c3aed; --green: #22c55e; --red: #ef4444; --yellow: #f59e0b; --text: #e2e8f0; --muted: #64748b; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { background: var(--bg); color: var(--text); font-family: 'SF Mono', monospace; padding: 24px; }
  h1 { font-size: 1.4rem; color: var(--accent); margin-bottom: 4px; }
  .sub { color: var(--muted); font-size: 0.8rem; margin-bottom: 24px; }
  .cards { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; margin-bottom: 24px; }
  .card { background: var(--card); border-radius: 8px; padding: 16px; }
  .card .label { font-size: 0.75rem; color: var(--muted); margin-bottom: 6px; }
  .card .value { font-size: 1.8rem; font-weight: 700; }
  .green { color: var(--green); }
  .red { color: var(--red); }
  table { width: 100%; border-collapse: collapse; font-size: 0.78rem; }
  th { text-align: left; padding: 8px; color: var(--muted); border-bottom: 1px solid #1e1e2e; }
  td { padding: 8px; border-bottom: 1px solid #1a1a24; }
  tr.err td { color: var(--red); }
  tr.warn td { color: var(--yellow); }
  .last { color: var(--muted); font-size: 0.75rem; margin-bottom: 12px; }
</style>
</head>
<body>
<h1>⚡ SWRV Trader</h1>
<p class="sub">Paper trading — Alpaca Markets</p>
<div class="cards">
  <div class="card"><div class="label">Cycles Run</div><div class="value">${stats.cycles}</div></div>
  <div class="card"><div class="label">Trade Signals</div><div class="value green">${stats.trades}</div></div>
  <div class="card"><div class="label">Errors</div><div class="value ${stats.errors > 0 ? "red" : ""}">${stats.errors}</div></div>
</div>
<p class="last">Last run: ${lastRun?.ts || "never"} — ${lastRun?.result?.action || "—"}</p>
<table>
  <thead><tr><th>Time</th><th>Level</th><th>Message</th><th>Symbol</th></tr></thead>
  <tbody>${logs || "<tr><td colspan='4' style='color:#64748b'>No logs yet</td></tr>"}</tbody>
</table>
</body>
</html>`;
}
