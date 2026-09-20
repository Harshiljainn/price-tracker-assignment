"use strict";

/**
 * test_cron.js
 *
 * Focused test for the POST /api/cron/scrape endpoint.
 *
 * Mocks both the scraper and the database so no real Playwright browsers are
 * launched and no real Supabase writes happen.
 *
 * Tests:
 *   1. Missing Authorization header → 401
 *   2. Wrong token → 401
 *   3. Correct token, no tracked products → 200 (nothing to scrape)
 *   4. Correct token, tracked products present → 202 (accepted)
 *   5. Second request while first run is still in progress → 409
 *
 * Usage:
 *   node test_cron.js
 */

require("dotenv").config();
const http = require("http");
const assert = require("assert");

// ---------------------------------------------------------------------------
// 1. Set a known CRON_SECRET for the test
// ---------------------------------------------------------------------------
const TEST_SECRET = "test-cron-secret-12345";
process.env.CRON_SECRET = TEST_SECRET;

// ---------------------------------------------------------------------------
// 2. Mock the scraper BEFORE requiring index.js
// ---------------------------------------------------------------------------
const scraperPath = require.resolve("./scraper");
require(scraperPath); // populate module cache

// Slow mock: resolves after 300ms so we can test the 409 concurrent guard
let mockScrapeDelay = 300;
require.cache[scraperPath].exports = {
  scrapeProduct: async (url) => {
    await new Promise((r) => setTimeout(r, mockScrapeDelay));
    return {
      success: true,
      url,
      price: 19999,
      mrp: 24999,
      inStock: true,
      attempts: 1,
      error: null,
    };
  },
};

// ---------------------------------------------------------------------------
// 3. Mock the database BEFORE requiring index.js
// ---------------------------------------------------------------------------
const dbPath = require.resolve("./db");
require(dbPath); // populate module cache

let mockProducts = []; // Controlled per-test

require.cache[dbPath].exports = {
  getTrackedProducts: async () => mockProducts,
  savePriceHistory: async () => ({ id: "mock-ph-id" }),
  saveScrapeLog: async () => ({ id: "mock-log-id" }),
  // Remaining exports unused by the cron endpoint but kept to prevent crashes
  getTrackedProductById: async () => null,
  createTrackedProduct: async () => ({}),
  deleteTrackedProduct: async () => true,
  getPriceHistory: async () => [],
  getScrapeLogs: async () => [],
};

// ---------------------------------------------------------------------------
// 4. Require index.js with both mocks in place
// ---------------------------------------------------------------------------
const { app } = require("./index");

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
async function makeRequest(serverUrl, method, path, { headers = {}, body = null } = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, serverUrl);
    const reqHeaders = { "Content-Type": "application/json", ...headers };

    const req = http.request(url, { method, headers: reqHeaders }, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => {
        let json = null;
        try { json = JSON.parse(data); } catch (_) { /* empty response */ }
        resolve({ statusCode: res.statusCode, data: json });
      });
    });

    req.on("error", reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
async function runTests() {
  console.log("==========================================");
  console.log("  Testing POST /api/cron/scrape");
  console.log("==========================================");

  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, resolve));
  const port = server.address().port;
  const baseUrl = `http://localhost:${port}`;
  console.log(`Server started on random port: ${port}\n`);

  let passed = 0;
  let failed = 0;

  async function test(label, fn) {
    try {
      await fn();
      console.log(`✅ ${label}`);
      passed++;
    } catch (err) {
      console.error(`❌ ${label}`);
      console.error("   ", err.message);
      failed++;
    }
  }

  try {
    // --- Test 1: No Authorization header → 401 ---
    await test("No Authorization header → 401", async () => {
      mockProducts = [];
      const res = await makeRequest(baseUrl, "POST", "/api/cron/scrape");
      assert.strictEqual(res.statusCode, 401);
      assert.ok(res.data.error);
    });

    // --- Test 2: Wrong token → 401 ---
    await test("Wrong Authorization token → 401", async () => {
      mockProducts = [];
      const res = await makeRequest(baseUrl, "POST", "/api/cron/scrape", {
        headers: { Authorization: "Bearer wrong-token" },
      });
      assert.strictEqual(res.statusCode, 401);
      assert.ok(res.data.error);
    });

    // --- Test 3: Correct token, no tracked products → 200 ---
    await test("Correct token, no tracked products → 200", async () => {
      mockProducts = [];
      const res = await makeRequest(baseUrl, "POST", "/api/cron/scrape", {
        headers: { Authorization: `Bearer ${TEST_SECRET}` },
      });
      assert.strictEqual(res.statusCode, 200);
      assert.strictEqual(res.data.scraped, 0);
    });

    // --- Test 4: Correct token, with tracked products → 202 ---
    await test("Correct token, tracked products present → 202 Accepted", async () => {
      mockProducts = [
        { id: "product-1", url: "https://demo.inelabteamdev.com/product/1" },
        { id: "product-2", url: "https://demo.inelabteamdev.com/product/2" },
      ];
      mockScrapeDelay = 50; // Fast for this test — let it finish quickly
      const res = await makeRequest(baseUrl, "POST", "/api/cron/scrape", {
        headers: { Authorization: `Bearer ${TEST_SECRET}` },
      });
      assert.strictEqual(res.statusCode, 202);
      assert.strictEqual(res.data.products, 2);
      assert.ok(res.data.message);
    });

    // Wait for the background job from test 4 to finish before test 5
    await new Promise((r) => setTimeout(r, 500));

    // --- Test 5: Second request while first run is still in progress → 409 ---
    await test("Concurrent second request while job is running → 409", async () => {
      mockProducts = [
        { id: "product-3", url: "https://demo.inelabteamdev.com/product/3" },
      ];
      mockScrapeDelay = 800; // Slow — guarantees overlap

      // Fire the first request (non-blocking)
      const first = makeRequest(baseUrl, "POST", "/api/cron/scrape", {
        headers: { Authorization: `Bearer ${TEST_SECRET}` },
      });

      // Small pause to ensure first request has set cronJobRunning = true
      await new Promise((r) => setTimeout(r, 80));

      // Fire the second request while the first is still running
      const second = await makeRequest(baseUrl, "POST", "/api/cron/scrape", {
        headers: { Authorization: `Bearer ${TEST_SECRET}` },
      });

      assert.strictEqual(second.statusCode, 409);
      assert.ok(second.data.error);

      // Wait for first request response too
      const firstRes = await first;
      assert.strictEqual(firstRes.statusCode, 202);

      // Wait for background job to finish so lock is released before server closes
      await new Promise((r) => setTimeout(r, 1200));
    });

  } finally {
    await new Promise((resolve) => server.close(resolve));
    console.log("\n==========================================");
    if (failed === 0) {
      console.log(`✅ All ${passed} cron endpoint tests passed!`);
    } else {
      console.log(`❌ ${failed} test(s) failed, ${passed} passed.`);
    }
    console.log("==========================================\n");
    process.exit(failed > 0 ? 1 : 0);
  }
}

runTests().catch((err) => {
  console.error("[test_cron] Unexpected top-level error:", err);
  process.exit(1);
});
