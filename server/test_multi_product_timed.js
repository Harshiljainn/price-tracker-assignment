/**
 * test_multi_product_timed.js
 *
 * Runs the live scraper against 6 real products twice each, recording
 * per-stage timing for every attempt. Used to validate Phase 6D performance
 * improvements and detect any remaining unnecessary delays.
 *
 * Usage: node test_multi_product_timed.js
 */
"use strict";

require("dotenv").config();

const { scrapeProduct } = require("./scraper");

const PRODUCTS = [
  "https://demo.inelabteamdev.com/product/2",
  "https://demo.inelabteamdev.com/product/850",
  "https://demo.inelabteamdev.com/product/851",
  "https://demo.inelabteamdev.com/product/852",
  "https://demo.inelabteamdev.com/product/854",
  "https://demo.inelabteamdev.com/product/857",
];

const RUNS_PER_PRODUCT = 3;

async function run() {
  const allResults = [];
  let totalPassed = 0, totalFailed = 0;

  for (const url of PRODUCTS) {
    for (let run = 1; run <= RUNS_PER_PRODUCT; run++) {
      const label = `${url.split("/").pop()} run${run}`;
      console.log(`\n${"=".repeat(60)}`);
      console.log(`--- Testing ${url} (run ${run}/${RUNS_PER_PRODUCT}) ---`);
      const t0 = Date.now();
      const result = await scrapeProduct(url, { headless: true });
      const elapsed = Date.now() - t0;

      const row = {
        product: url.split("/").pop(),
        run,
        price: result.price,
        mrp: result.mrp,
        inStock: result.inStock,
        quantity: result.quantity,
        title: result.title,
        attempts: result.attempts,
        elapsed,
        success: result.success,
      };
      allResults.push(row);

      if (result.success) {
        totalPassed++;
        console.log(`✅ PASS [${elapsed}ms] attempts=${result.attempts} price=₹${result.price} mrp=₹${result.mrp}`);
      } else {
        totalFailed++;
        console.log(`❌ FAIL [${elapsed}ms] attempts=${result.attempts} error="${result.error}"`);
      }
    }
  }

  // Summary table
  console.log(`\n${"=".repeat(80)}`);
  console.log("SUMMARY TABLE");
  console.log(`${"=".repeat(80)}`);
  console.log(`Product  | Run | Price    | MRP      | Stock | Qty  | Time    | Attempts | Result`);
  console.log(`---------|-----|----------|----------|-------|------|---------|----------|-------`);
  for (const r of allResults) {
    const stock = r.inStock === true ? "In" : r.inStock === false ? "Out" : "?";
    console.log(
      `/product/${String(r.product).padEnd(3)} | ${r.run}   | ` +
      `₹${String(r.price ?? "-").padEnd(7)}| ₹${String(r.mrp ?? "-").padEnd(7)}| ` +
      `${stock.padEnd(5)} | ${String(r.quantity ?? "-").padEnd(4)} | ` +
      `${String(r.elapsed).padEnd(7)}ms | ${r.attempts}        | ${r.success ? "✅ PASS" : "❌ FAIL"}`
    );
  }

  const times = allResults.filter(r => r.success).map(r => r.elapsed);
  const minTime = Math.min(...times);
  const maxTime = Math.max(...times);
  const avgTime = Math.round(times.reduce((a, b) => a + b, 0) / times.length);

  console.log(`\nStatistics (successful scrapes only):`);
  console.log(`  Fastest: ${minTime}ms`);
  console.log(`  Slowest: ${maxTime}ms`);
  console.log(`  Average: ${avgTime}ms`);
  console.log(`\nResults: ${totalPassed} passed, ${totalFailed} failed`);

  if (totalFailed > 0) {
    process.exit(1);
  }
}

run().catch((err) => {
  console.error("Unexpected test error:", err);
  process.exit(1);
});
