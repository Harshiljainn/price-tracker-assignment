"use strict";

/**
 * test_db.js
 * 
 * Local test script to verify Supabase connectivity and schema functionality.
 * This does NOT call the scraper. It only tests the database service module.
 * 
 * Usage:
 *   node test_db.js
 */

require("dotenv").config();
const db = require("./db");

async function runTests() {
  console.log("==========================================");
  console.log("  Testing Supabase Database Service");
  console.log("==========================================");

  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_KEY) {
    console.error("❌ SUPABASE_URL or SUPABASE_KEY is not set in .env");
    console.error("Please set them and run the SQL migration first.");
    process.exit(1);
  }

  let product = null;
  let testPassed = false;

  try {
    // 1. Create a mock product
    console.log("\n1. Testing createTrackedProduct()...");
    const mockUrl = `https://demo.inelabteamdev.com/product/test-${Date.now()}`;
    product = await db.createTrackedProduct(
      mockUrl,
      "Test Product",
      "https://example.com/image.png"
    );
    console.log("✅ Created product:", product.id);

    // 2. Fetch tracked products
    console.log("\n2. Testing getTrackedProducts()...");
    const products = await db.getTrackedProducts();
    console.log(`✅ Found ${products.length} tracked products.`);
    
    // 2a. Global Alert Email
    console.log("\n2a. Testing setGlobalAlertEmail() and getGlobalAlertEmail()...");
    await db.setGlobalAlertEmail("test_global@example.com");
    console.log("✅ Set global alert email");
    const globalEmail = await db.getGlobalAlertEmail();
    console.log("✅ Retrieved global alert email:", globalEmail);
    if (globalEmail !== "test_global@example.com") throw new Error("Global email mismatch");
    
    // 3. Save Price History
    console.log("\n3. Testing savePriceHistory()...");
    const priceEntry = await db.savePriceHistory(
      product.id,
      2999.00,
      3500.00,
      true,
      5 // quantity
    );
    console.log("✅ Saved price history:", priceEntry.id, "Price:", priceEntry.price, "Quantity:", priceEntry.quantity);

    // 4. Save Scrape Log (Success)
    console.log("\n4. Testing saveScrapeLog() for SUCCESS...");
    const logSuccess = await db.saveScrapeLog(
      product.id,
      "SUCCESS",
      1,
      "Scraped successfully",
      4500
    );
    console.log("✅ Saved success log:", logSuccess.id);

    // 5. Save Scrape Log (Failure)
    console.log("\n5. Testing saveScrapeLog() for FAILED...");
    const logFailure = await db.saveScrapeLog(
      product.id,
      "FAILED",
      3,
      "Timeout extracting price",
      30500
    );
    console.log("✅ Saved failure log:", logFailure.id);

    // 6. Get Price History
    console.log("\n6. Testing getPriceHistory()...");
    const history = await db.getPriceHistory(product.id);
    console.log(`✅ Retrieved ${history.length} price history records.`);

    // 7. Get Scrape Logs
    console.log("\n7. Testing getScrapeLogs()...");
    const logs = await db.getScrapeLogs(product.id);
    console.log(`✅ Retrieved ${logs.length} scrape logs.`);

    console.log("\n==========================================");
    console.log("✅ All Database Tests Passed!");
    console.log("==========================================");

    testPassed = true;

  } catch (error) {
    console.error("\n❌ Test Failed:", error.message);
    console.error("Did you run the SQL migration (001_init.sql) in Supabase?");
  } finally {
    // Always clean up the test product regardless of pass/fail.
    // The schema uses ON DELETE CASCADE, so all related price_history and
    // scrape_logs rows for this product are removed automatically.
    if (product) {
      try {
        await db.deleteTrackedProduct(product.id);
        console.log(`\n🧹 Cleanup: test product ${product.id} deleted from Supabase.`);
      } catch (cleanupErr) {
        console.error(`\n⚠️  Cleanup warning: could not delete test product ${product.id}: ${cleanupErr.message}`);
      }
    }

    if (!testPassed) {
      process.exit(1);
    }
  }
}

runTests();
