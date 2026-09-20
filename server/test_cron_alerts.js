"use strict";

require("dotenv").config();
const http = require("http");
const assert = require("assert");

const TEST_SECRET = "test-cron-secret-12345";
process.env.CRON_SECRET = TEST_SECRET;

// --- Mocks ---

// 1. Mock Scraper
const scraperPath = require.resolve("./scraper");
require(scraperPath);
let mockScrapeResults = {};
require.cache[scraperPath].exports = {
  scrapeProduct: async (url) => {
    const id = "product-" + url.split('/').pop();
    if (mockScrapeResults[id]) {
      return mockScrapeResults[id];
    }
    return { success: true, url, price: 100, inStock: true, attempts: 1, error: null };
  },
};

// 2. Mock DB
const dbPath = require.resolve("./db");
require(dbPath);
let mockProducts = [];
let mockPriceHistoryMap = {};
let mockGlobalAlertEmail = null;
require.cache[dbPath].exports = {
  getTrackedProducts: async () => mockProducts,
  savePriceHistory: async () => ({ id: "mock-ph-id" }),
  saveScrapeLog: async () => ({ id: "mock-log-id" }),
  updateProductName: async () => true,
  getPriceHistory: async (id) => mockPriceHistoryMap[id] || [],
  getGlobalAlertEmail: async () => mockGlobalAlertEmail,
};

// 3. Mock Alerts — capture calls with recipient
const alertsPath = require.resolve("./alerts");
require(alertsPath);
let alertMockLogs = [];
let mockAlertsShouldThrowFor = null;
require.cache[alertsPath].exports = {
  sendPriceDropAlert: async (data) => {
    if (mockAlertsShouldThrowFor === data.productName) throw new Error('Mock Alert Send Error');
    alertMockLogs.push({ type: 'drop', data });
    return { success: true };
  },
  sendBackInStockAlert: async (data) => {
    if (mockAlertsShouldThrowFor === data.productName) throw new Error('Mock Alert Send Error');
    alertMockLogs.push({ type: 'stock', data });
    return { success: true };
  }
};

// --- App ---
const { app } = require("./index");

async function makeRequest(serverUrl) {
  return new Promise((resolve, reject) => {
    const url = new URL("/api/cron/scrape", serverUrl);
    const req = http.request(url, {
      method: "POST",
      headers: { "Authorization": `Bearer ${TEST_SECRET}` }
    }, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => {
        resolve({ statusCode: res.statusCode, data: JSON.parse(data) });
      });
    });
    req.on("error", reject);
    req.end();
  });
}

async function runTests() {
  console.log("==========================================");
  console.log("  Testing Cron Alerts Integration");
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
      alertMockLogs = [];
      mockAlertsShouldThrowFor = null;
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
    await test("100 -> 80 = price-drop alert with global email", async () => {
      mockProducts = [{ id: "product-1", url: "http://test/1", name: "P1" }];
      mockPriceHistoryMap = { "product-1": [{ price: 100, in_stock: true }] };
      mockScrapeResults = { "product-1": { success: true, price: 80, inStock: true } };
      mockGlobalAlertEmail = "user@test.com";

      const res = await makeRequest(baseUrl);
      assert.strictEqual(res.statusCode, 202);
      await new Promise(r => setTimeout(r, 100));

      assert.strictEqual(alertMockLogs.length, 1);
      assert.strictEqual(alertMockLogs[0].type, 'drop');
      assert.strictEqual(alertMockLogs[0].data.oldPrice, 100);
      assert.strictEqual(alertMockLogs[0].data.newPrice, 80);
      assert.strictEqual(alertMockLogs[0].data.recipient, 'user@test.com');
    });

    await test("100 -> 100 = no alert", async () => {
      mockProducts = [{ id: "product-1", url: "http://test/1", name: "P1" }];
      mockPriceHistoryMap = { "product-1": [{ price: 100, in_stock: true }] };
      mockScrapeResults = { "product-1": { success: true, price: 100, inStock: true } };
      mockGlobalAlertEmail = "user@test.com";

      await makeRequest(baseUrl);
      await new Promise(r => setTimeout(r, 100));
      assert.strictEqual(alertMockLogs.length, 0);
    });

    await test("100 -> 120 = no alert", async () => {
      mockProducts = [{ id: "product-1", url: "http://test/1", name: "P1" }];
      mockPriceHistoryMap = { "product-1": [{ price: 100, in_stock: true }] };
      mockScrapeResults = { "product-1": { success: true, price: 120, inStock: true } };
      mockGlobalAlertEmail = "user@test.com";

      await makeRequest(baseUrl);
      await new Promise(r => setTimeout(r, 100));
      assert.strictEqual(alertMockLogs.length, 0);
    });

    await test("first scrape = no alert", async () => {
      mockProducts = [{ id: "product-1", url: "http://test/1", name: "P1" }];
      mockPriceHistoryMap = { "product-1": [] }; // No previous history
      mockScrapeResults = { "product-1": { success: true, price: 80, inStock: true } };
      mockGlobalAlertEmail = "user@test.com";

      await makeRequest(baseUrl);
      await new Promise(r => setTimeout(r, 100));
      assert.strictEqual(alertMockLogs.length, 0);
    });

    await test("null/failed price = no alert", async () => {
      mockProducts = [{ id: "product-1", url: "http://test/1", name: "P1" }];
      mockPriceHistoryMap = { "product-1": [{ price: 100, in_stock: true }] };
      mockScrapeResults = { "product-1": { success: false, error: "Failed" } };
      mockGlobalAlertEmail = "user@test.com";

      await makeRequest(baseUrl);
      await new Promise(r => setTimeout(r, 100));
      assert.strictEqual(alertMockLogs.length, 0);
    });

    await test("false -> true = back-in-stock alert with global email", async () => {
      mockProducts = [{ id: "product-1", url: "http://test/1", name: "P1" }];
      mockPriceHistoryMap = { "product-1": [{ price: 100, in_stock: false }] };
      mockScrapeResults = { "product-1": { success: true, price: 100, inStock: true } };
      mockGlobalAlertEmail = "user@test.com";

      await makeRequest(baseUrl);
      await new Promise(r => setTimeout(r, 100));
      assert.strictEqual(alertMockLogs.length, 1);
      assert.strictEqual(alertMockLogs[0].type, 'stock');
      assert.strictEqual(alertMockLogs[0].data.recipient, 'user@test.com');
    });

    await test("true -> true = no alert", async () => {
      mockProducts = [{ id: "product-1", url: "http://test/1", name: "P1" }];
      mockPriceHistoryMap = { "product-1": [{ price: 100, in_stock: true }] };
      mockScrapeResults = { "product-1": { success: true, price: 100, inStock: true } };
      mockGlobalAlertEmail = "user@test.com";

      await makeRequest(baseUrl);
      await new Promise(r => setTimeout(r, 100));
      assert.strictEqual(alertMockLogs.length, 0);
    });

    await test("true -> false = no alert", async () => {
      mockProducts = [{ id: "product-1", url: "http://test/1", name: "P1" }];
      mockPriceHistoryMap = { "product-1": [{ price: 100, in_stock: true }] };
      mockScrapeResults = { "product-1": { success: true, price: 100, inStock: false } };
      mockGlobalAlertEmail = "user@test.com";

      await makeRequest(baseUrl);
      await new Promise(r => setTimeout(r, 100));
      assert.strictEqual(alertMockLogs.length, 0);
    });

    await test("No global email = no alert, scraping continues normally", async () => {
      mockProducts = [
        { id: "product-1", url: "http://test/1", name: "P1" },
        { id: "product-2", url: "http://test/2", name: "P2" }
      ];
      mockPriceHistoryMap = {
        "product-1": [{ price: 100, in_stock: true }],
        "product-2": [{ price: 100, in_stock: true }]
      };
      mockScrapeResults = {
        "product-1": { success: true, price: 80, inStock: true }, // price drop, but no email → no alert
        "product-2": { success: true, price: 70, inStock: true }  // price drop, no email → no alert
      };
      mockGlobalAlertEmail = null;

      await makeRequest(baseUrl);
      await new Promise(r => setTimeout(r, 200));

      // No alerts should be sent because global email is null
      assert.strictEqual(alertMockLogs.length, 0);
    });

    await test("SendGrid throws an error = cron continues safely for multiple products", async () => {
      mockProducts = [
        { id: "product-1", url: "http://test/1", name: "P1-Throw" },
        { id: "product-2", url: "http://test/2", name: "P2-Safe" }
      ];
      mockPriceHistoryMap = {
        "product-1": [{ price: 100, in_stock: true }],
        "product-2": [{ price: 100, in_stock: true }]
      };
      mockScrapeResults = {
        "product-1": { success: true, price: 80, inStock: true, title: "P1-Throw" },
        "product-2": { success: true, price: 70, inStock: true, title: "P2-Safe" }
      };
      mockGlobalAlertEmail = "user@test.com";

      mockAlertsShouldThrowFor = "P1-Throw";

      await makeRequest(baseUrl);
      await new Promise(r => setTimeout(r, 200));

      // Product-2 should still have been alerted despite product-1 error
      assert.strictEqual(alertMockLogs.length, 1);
      assert.strictEqual(alertMockLogs[0].data.productName, "P2-Safe");
    });

  } finally {
    await new Promise((resolve) => server.close(resolve));
    console.log("\n==========================================");
    if (failed === 0) {
      console.log(`✅ All ${passed} integration tests passed!`);
    } else {
      console.log(`❌ ${failed} test(s) failed, ${passed} passed.`);
    }
    console.log("==========================================\n");
    process.exit(failed > 0 ? 1 : 0);
  }
}

runTests();
