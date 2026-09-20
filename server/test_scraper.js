"use strict";

/**
 * test_scraper.js
 *
 * Local test script for scraper.js.
 * Calls scrapeProduct() against the same URL used during investigation
 * (_probe_playwright3.js used /product/850) and prints the full result.
 *
 * Usage:
 *   node test_scraper.js
 *   node test_scraper.js <full-product-url>
 *   node test_scraper.js --headed       (run with a visible browser window)
 *
 * Examples:
 *   node test_scraper.js
 *   node test_scraper.js https://demo.inelabteamdev.com/product/999
 *   node test_scraper.js --headed
 *   node test_scraper.js https://demo.inelabteamdev.com/product/850 --headed
 */

const { scrapeProduct } = require("./scraper");

// Parse CLI args -----------------------------------------------------------
const args = process.argv.slice(2);
const headless = !args.includes("--headed");
const urlArg = args.find((a) => a.startsWith("http"));

// Default: the URL that was used in all probe scripts
const TARGET_URL =
  urlArg || "https://demo.inelabteamdev.com/product/850";

// --------------------------------------------------------------------------

async function main() {
  console.log("=".repeat(60));
  console.log("  Price Tracker — scraper.js test");
  console.log("=".repeat(60));
  console.log(`  URL      : ${TARGET_URL}`);
  console.log(`  Headless : ${headless}`);
  console.log(`  Time     : ${new Date().toISOString()}`);
  console.log("=".repeat(60));
  console.log();

  const start = Date.now();

  const result = await scrapeProduct(TARGET_URL, { headless });

  const elapsed = Date.now() - start;

  console.log();
  console.log("=".repeat(60));
  console.log("  RESULT");
  console.log("=".repeat(60));
  console.log(JSON.stringify(result, null, 2));
  console.log();
  console.log(`  Total time: ${elapsed}ms`);
  console.log("=".repeat(60));

  // Exit with code 1 if scraping failed so CI / shell scripts can detect it
  process.exit(result.success ? 0 : 1);
}

main().catch((err) => {
  console.error("[test_scraper] Unexpected top-level error:", err);
  process.exit(1);
});
