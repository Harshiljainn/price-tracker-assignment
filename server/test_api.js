"use strict";

/**
 * test_api.js
 * 
 * Local test script to verify Express API endpoints.
 * It mocks the scraper so we don't hit the demo store during this API test.
 * 
 * Usage:
 *   node test_api.js
 */

require("dotenv").config();
const http = require("http");
const assert = require("assert");

// 1. Mock the scraper BEFORE requiring index.js
const scraperModulePath = require.resolve("./scraper");
require(scraperModulePath); // Load it first to populate the cache
let mockScrapeResult = {
  success: true,
  url: "https://demo.inelabteamdev.com/product/test",
  price: 1500,
  mrp: 2000,
  inStock: true,
  attempts: 1,
  error: null
};

require.cache[scraperModulePath].exports = {
  scrapeProduct: async (url) => {
    console.log(`[MOCK SCRAPER] Called with URL: ${url}`);
    // Simulate a slight delay
    await new Promise(r => setTimeout(r, 100));
    return mockScrapeResult;
  }
};

// 2. Require index.js (which will now get the mocked scraper)
const { app } = require("./index");

// Helper to make HTTP requests
async function makeRequest(serverUrl, method, path, body = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, serverUrl);
    const options = {
      method,
      headers: {
        "Content-Type": "application/json"
      }
    };

    const req = http.request(url, options, (res) => {
      let data = "";
      res.on("data", chunk => data += chunk);
      res.on("end", () => {
        let json = null;
        if (data) {
          try {
            json = JSON.parse(data);
          } catch (e) {
            // Ignore parse errors if empty or not json
          }
        }
        resolve({
          statusCode: res.statusCode,
          data: json
        });
      });
    });

    req.on("error", reject);

    if (body) {
      req.write(JSON.stringify(body));
    }
    req.end();
  });
}

async function runTests() {
  console.log("==========================================");
  console.log("  Testing Express API (Mocked Scraper)");
  console.log("==========================================");

  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_KEY) {
    console.error("❌ SUPABASE_URL or SUPABASE_KEY is not set in .env");
    process.exit(1);
  }

  const server = http.createServer(app);
  await new Promise(resolve => server.listen(0, resolve));
  const port = server.address().port;
  const baseUrl = `http://localhost:${port}`;
  console.log(`Server started on random port: ${port}`);

  try {
    let createdProductId = null;

    // 1. Health check
    console.log("\n1. GET /api/health");
    let res = await makeRequest(baseUrl, "GET", "/api/health");
    console.log(`Status: ${res.statusCode}`);
    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.data.ok, true);
    console.log("✅ Passed");

    // 2. Create product
    console.log("\n2. POST /api/products");
    res = await makeRequest(baseUrl, "POST", "/api/products", {
      name: "API Test Product",
      url: `https://demo.inelabteamdev.com/product/api-test-${Date.now()}`
    });
    console.log(`Status: ${res.statusCode}`);
    assert.strictEqual(res.statusCode, 201);
    assert.ok(res.data.id);
    createdProductId = res.data.id;
    console.log("✅ Passed, created ID:", createdProductId);

    // 2a. PUT /api/settings/alert-email
    console.log("\n2a. PUT /api/settings/alert-email");
    res = await makeRequest(baseUrl, "PUT", "/api/settings/alert-email", {
      email: "test_global@example.com"
    });
    console.log(`Status: ${res.statusCode}`);
    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.data.email, "test_global@example.com");
    console.log("✅ Passed");

    // 2b. GET /api/settings/alert-email
    console.log("\n2b. GET /api/settings/alert-email");
    res = await makeRequest(baseUrl, "GET", "/api/settings/alert-email");
    console.log(`Status: ${res.statusCode}`);
    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.data.email, "test_global@example.com");
    console.log("✅ Passed");

    // 3. Get all products
    console.log("\n3. GET /api/products");
    res = await makeRequest(baseUrl, "GET", "/api/products");
    console.log(`Status: ${res.statusCode}`);
    assert.strictEqual(res.statusCode, 200);
    assert.ok(Array.isArray(res.data));
    assert.ok(res.data.some(p => p.id === createdProductId));
    console.log("✅ Passed");

    // 3a. Search product (matching)
    console.log("\n3a. GET /api/products?search=API%20Test");
    res = await makeRequest(baseUrl, "GET", "/api/products?search=API%20Test");
    console.log(`Status: ${res.statusCode}`);
    assert.strictEqual(res.statusCode, 200);
    assert.ok(Array.isArray(res.data));
    assert.ok(res.data.some(p => p.id === createdProductId));
    console.log("✅ Passed");

    // 3b. Search product (case-insensitive)
    console.log("\n3b. GET /api/products?search=api%20test");
    res = await makeRequest(baseUrl, "GET", "/api/products?search=api%20test");
    console.log(`Status: ${res.statusCode}`);
    assert.strictEqual(res.statusCode, 200);
    assert.ok(Array.isArray(res.data));
    assert.ok(res.data.some(p => p.id === createdProductId));
    console.log("✅ Passed");

    // 3c. Search product (non-matching)
    console.log("\n3c. GET /api/products?search=NonExistentGibberish12345");
    res = await makeRequest(baseUrl, "GET", "/api/products?search=NonExistentGibberish12345");
    console.log(`Status: ${res.statusCode}`);
    assert.strictEqual(res.statusCode, 200);
    assert.ok(Array.isArray(res.data));
    assert.strictEqual(res.data.length, 0);
    console.log("✅ Passed");

    // 4. Get specific product
    console.log(`\n4. GET /api/products/${createdProductId}`);
    res = await makeRequest(baseUrl, "GET", `/api/products/${createdProductId}`);
    console.log(`Status: ${res.statusCode}`);
    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.data.id, createdProductId);
    console.log("✅ Passed");

    // 5. Scrape product (SUCCESS)
    console.log(`\n5. POST /api/products/${createdProductId}/scrape (SUCCESS)`);
    res = await makeRequest(baseUrl, "POST", `/api/products/${createdProductId}/scrape`);
    console.log(`Status: ${res.statusCode}`);
    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.data.success, true);
    assert.strictEqual(res.data.price, 1500);
    console.log("✅ Passed");

    // 6. Scrape product (FAILED)
    console.log(`\n6. POST /api/products/${createdProductId}/scrape (FAILED)`);
    // Change mock to fail
    mockScrapeResult = {
      success: false,
      url: res.data.url,
      price: null,
      mrp: null,
      inStock: null,
      attempts: 3,
      error: "Mock failure"
    };
    res = await makeRequest(baseUrl, "POST", `/api/products/${createdProductId}/scrape`);
    console.log(`Status: ${res.statusCode}`);
    assert.strictEqual(res.statusCode, 200); // Route returns 200, payload has success=false
    assert.strictEqual(res.data.success, false);
    assert.strictEqual(res.data.error, "Mock failure");
    console.log("✅ Passed");

    // 7. Get history
    console.log(`\n7. GET /api/products/${createdProductId}/history`);
    res = await makeRequest(baseUrl, "GET", `/api/products/${createdProductId}/history`);
    console.log(`Status: ${res.statusCode}`);
    assert.strictEqual(res.statusCode, 200);
    assert.ok(Array.isArray(res.data));
    assert.strictEqual(res.data.length, 1); // Should only have 1 from the successful scrape
    assert.strictEqual(res.data[0].price, 1500);
    console.log("✅ Passed");

    // 8. Get logs
    console.log(`\n8. GET /api/products/${createdProductId}/logs`);
    res = await makeRequest(baseUrl, "GET", `/api/products/${createdProductId}/logs`);
    console.log(`Status: ${res.statusCode}`);
    assert.strictEqual(res.statusCode, 200);
    assert.ok(Array.isArray(res.data));
    assert.strictEqual(res.data.length, 2); // 1 success, 1 failure
    console.log("✅ Passed");

    // 9. Delete product
    console.log(`\n9. DELETE /api/products/${createdProductId}`);
    res = await makeRequest(baseUrl, "DELETE", `/api/products/${createdProductId}`);
    console.log(`Status: ${res.statusCode}`);
    assert.strictEqual(res.statusCode, 200);
    console.log("✅ Passed");

    // 10. Duplicate URL detection
    console.log(`\n10. POST /api/products (Duplicate URL → should return 409)`);
    const dedupUrl = `https://demo.inelabteamdev.com/product/dedup-test-${Date.now()}`;
    // First creation — should succeed
    let dedupRes1 = await makeRequest(baseUrl, "POST", "/api/products", { url: dedupUrl });
    const dedupId = dedupRes1.data.id;
    assert.strictEqual(dedupRes1.statusCode, 201, `Expected 201 on first create, got ${dedupRes1.statusCode}`);
    console.log(`  First creation → 201 ✅`);

    // Second creation with same URL — should return 409
    let dedupRes2 = await makeRequest(baseUrl, "POST", "/api/products", { url: dedupUrl });
    assert.strictEqual(dedupRes2.statusCode, 409, `Expected 409 on duplicate create, got ${dedupRes2.statusCode}`);
    assert.strictEqual(dedupRes2.data.error, "DUPLICATE_PRODUCT", `Expected DUPLICATE_PRODUCT in error body`);
    console.log(`  Duplicate URL → 409 ✅`);
    
    // Cleanup dedup test product
    await makeRequest(baseUrl, "DELETE", `/api/products/${dedupId}`);
    console.log("✅ Passed");

    console.log("\n==========================================");
    console.log("✅ All API Tests Passed!");
    console.log("==========================================");

  } catch (error) {
    console.error("\n❌ Test Failed:", error);
  } finally {
    server.close();
  }
}

runTests();
