#!/usr/bin/env node
// SWRV Trader — single-shot runner for GitHub Actions / Node / Freebuff
// Run: node src/run-once.js

import { runTradingCycle } from "./bot.js";

console.log("SWRV Trader starting...");
const result = await runTradingCycle();
console.log("Result:", JSON.stringify(result, null, 2));
process.exit(result.action === "error" ? 1 : 0);
