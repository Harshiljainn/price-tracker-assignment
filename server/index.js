require("dotenv").config();
const express = require("express");
const cors = require("cors");
const db = require("./db");
const { scrapeProduct } = require("./scraper");
const alerts = require("./alerts");

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json({ limit: "1mb" })); // Reasonable JSON body size limit

// 8. GET /api/health
app.get("/api/health", (req, res) => {
  res.json({ ok: true });
});

// 1. GET /api/products
app.get("/api/products", async (req, res) => {
  try {
    const { search } = req.query;
    const products = await db.getTrackedProducts(search);
    res.json(products);
  } catch (error) {
    console.error("GET /api/products error:", error.message);
    res.status(500).json({ error: "Failed to fetch products" });
  }
});

// 2. POST /api/products
app.post("/api/products", async (req, res) => {
  try {
    const { name, url, image_url, alertEmail } = req.body;

    if (!url || typeof url !== "string") {
      return res.status(400).json({ error: "URL or SKU is required and must be a string" });
    }

    if (!alertEmail || typeof alertEmail !== "string" || !/^\S+@\S+\.\S+$/.test(alertEmail)) {
      return res.status(400).json({ error: "Valid alert email is required" });
    }


    let finalUrl = url;

    // Detect if the input might be a SKU instead of a URL
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      try {
        finalUrl = await db.resolveSku(url);
      } catch (err) {
        return res.status(400).json({ error: err.message });
      }
    } else {
      try {
        new URL(url);
      } catch (e) {
        return res.status(400).json({ error: "URL is invalid" });
      }
    }

    const product = await db.createTrackedProduct(finalUrl, name, image_url, alertEmail);
    res.status(201).json(product);
  } catch (error) {
    if (error.code === 'DUPLICATE_PRODUCT') {
      return res.status(409).json({ error: "DUPLICATE_PRODUCT" });
    }
    console.error("POST /api/products error:", error.message);
    res.status(500).json({ error: "Failed to create product" });
  }
});

// 3. GET /api/products/:id
app.get("/api/products/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const product = await db.getTrackedProductById(id);
    
    if (!product) {
      return res.status(404).json({ error: "Product not found" });
    }

    res.json(product);
  } catch (error) {
    console.error("GET /api/products/:id error:", error.message);
    res.status(500).json({ error: "Failed to fetch product" });
  }
});

// 4. DELETE /api/products/:id
app.delete("/api/products/:id", async (req, res) => {
  try {
    const { id } = req.params;
    // Check if it exists first to return 404 if not found
    const product = await db.getTrackedProductById(id);
    if (!product) {
      return res.status(404).json({ error: "Product not found" });
    }

    await db.deleteTrackedProduct(id);
    res.json({ success: true, message: "Product untracked successfully" });
  } catch (error) {
    console.error("DELETE /api/products/:id error:", error.message);
    res.status(500).json({ error: "Failed to delete product" });
  }
});

// 5. POST /api/products/:id/scrape
app.post("/api/products/:id/scrape", async (req, res) => {
  try {
    const { id } = req.params;
    
    const product = await db.getTrackedProductById(id);
    if (!product) {
      return res.status(404).json({ error: "Product not found" });
    }

    const startTime = Date.now();
    const scrapeResult = await scrapeProduct(product.url);
    const durationMs = Date.now() - startTime;

    if (scrapeResult.success && scrapeResult.price !== null) {
      await db.savePriceHistory(
        id,
        scrapeResult.price,
        scrapeResult.mrp,
        scrapeResult.inStock,
        scrapeResult.quantity
      );
      
      if (scrapeResult.title && scrapeResult.title !== product.name) {
        await db.updateProductName(id, scrapeResult.title);
      }

      // Save success log
      await db.saveScrapeLog(
        id,
        "SUCCESS",
        scrapeResult.attempts,
        "Scrape completed successfully",
        durationMs
      );

      res.json({
        success: true,
        price: scrapeResult.price,
        mrp: scrapeResult.mrp,
        inStock: scrapeResult.inStock,
        quantity: scrapeResult.quantity,
        durationMs
      });
    } else {
      // Failed scrape
      await db.saveScrapeLog(
        id,
        "FAILED",
        scrapeResult.attempts,
        scrapeResult.error || "Scrape failed without explicit error",
        durationMs
      );

      // We still return 200 because the API call technically succeeded in running the job, 
      // but we indicate success: false in the JSON body.
      // 500 would imply the server crashed.
      res.json({
        success: false,
        error: scrapeResult.error,
        attempts: scrapeResult.attempts,
        durationMs
      });
    }

  } catch (error) {
    console.error("POST /api/products/:id/scrape error:", error.message);
    res.status(500).json({ error: "Internal server error during scrape" });
  }
});

// 6. GET /api/products/:id/history
app.get("/api/products/:id/history", async (req, res) => {
  try {
    const { id } = req.params;
    // We don't strictly need to check if product exists if no history is fine (empty array)
    const history = await db.getPriceHistory(id);
    res.json(history);
  } catch (error) {
    console.error("GET /api/products/:id/history error:", error.message);
    res.status(500).json({ error: "Failed to fetch price history" });
  }
});

// 7. GET /api/products/:id/logs
app.get("/api/products/:id/logs", async (req, res) => {
  try {
    const { id } = req.params;
    const logs = await db.getScrapeLogs(id);
    res.json(logs);
  } catch (error) {
    console.error("GET /api/products/:id/logs error:", error.message);
    res.status(500).json({ error: "Failed to fetch scrape logs" });
  }
});

// ---------------------------------------------------------------------------
// Cron lock — prevents concurrent scrape runs on a single process.
// (Sufficient for Render free tier which runs a single instance.)
// ---------------------------------------------------------------------------
let cronJobRunning = false;

// 9. POST /api/cron/scrape
//
// Called by an external cron service (e.g. cron-job.org) every 2 hours.
// Authenticates via: Authorization: Bearer <CRON_SECRET>
// Returns 202 immediately; actual scraping runs asynchronously.
app.post("/api/cron/scrape", async (req, res) => {
  // --- Authentication ---
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    // Server misconfiguration — refuse to run without a secret
    console.error("[cron] CRON_SECRET is not set — refusing request.");
    return res.status(500).json({ error: "Server misconfiguration: CRON_SECRET not set" });
  }

  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.startsWith("Bearer ")
    ? authHeader.slice(7)
    : null;

  if (!token || token !== cronSecret) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  // --- Duplicate-run guard ---
  if (cronJobRunning) {
    console.warn("[cron] Request rejected — a scrape run is already in progress.");
    return res.status(409).json({ error: "A scrape run is already in progress" });
  }

  // --- Fetch tracked products before accepting ---
  let products;
  try {
    products = await db.getTrackedProducts();
  } catch (err) {
    console.error("[cron] Failed to fetch tracked products:", err.message);
    return res.status(500).json({ error: "Failed to fetch tracked products" });
  }

  if (products.length === 0) {
    console.log("[cron] No tracked products — nothing to scrape.");
    return res.status(200).json({ message: "No tracked products to scrape", scraped: 0 });
  }

  // --- Accept the request and start scraping asynchronously ---
  cronJobRunning = true;
  res.status(202).json({
    message: "Scrape run accepted",
    products: products.length,
  });

  // Fire-and-forget: run after response is sent so cron HTTP timeout is never hit.
  (async () => {
    const runStart = Date.now();
    console.log(`[cron] Starting scheduled scrape of ${products.length} product(s)...`);

    const results = { success: 0, failed: 0, errors: [] };

    try {
      for (const product of products) {
        console.log(`[cron] Scraping product ${product.id} — ${product.url}`);
        const startTime = Date.now();
        let scrapeResult;
        let previousState = null;

        try {
          const history = await db.getPriceHistory(product.id, 1);
          if (history && history.length > 0) {
            previousState = history[0];
          }
        } catch (err) {
          console.error(`[cron] Failed to fetch previous state for ${product.id}:`, err.message);
        }

        try {
          scrapeResult = await scrapeProduct(product.url, { headless: true });
        } catch (unexpectedErr) {
          // scrapeProduct() should never throw, but guard anyway
          const durationMs = Date.now() - startTime;
          const msg = `Unexpected error: ${unexpectedErr.message}`;
          console.error(`[cron] Unexpected error for product ${product.id}: ${msg}`);
          await db.saveScrapeLog(product.id, "FAILED", 0, msg, durationMs).catch((e) =>
            console.error("[cron] Failed to write error log:", e.message)
          );
          results.failed++;
          results.errors.push({ id: product.id, error: msg });
          continue; // Move on to next product
        }

        const durationMs = Date.now() - startTime;

        if (scrapeResult.success && scrapeResult.price !== null) {
          // --- Successful scrape ---
          try {
            await db.savePriceHistory(
              product.id,
              scrapeResult.price,
              scrapeResult.mrp,
              scrapeResult.inStock
            );
            
            if (scrapeResult.title && scrapeResult.title !== product.name) {
              await db.updateProductName(product.id, scrapeResult.title);
            }
            
            await db.saveScrapeLog(
              product.id,
              "SUCCESS",
              scrapeResult.attempts,
              "Scheduled scrape completed successfully",
              durationMs
            );
            results.success++;
            console.log(
              `[cron] ✅ Product ${product.id}: price=${scrapeResult.price} ` +
              `mrp=${scrapeResult.mrp} inStock=${scrapeResult.inStock}`
            );

            // --- Alerts ---
            if (previousState && product.alert_email) {
              try {
                // 1. Price drop alert
                if (
                  typeof previousState.price === 'number' &&
                  typeof scrapeResult.price === 'number' &&
                  scrapeResult.price < previousState.price
                ) {
                  await alerts.sendPriceDropAlert({
                    recipient: product.alert_email,
                    productName: scrapeResult.title || product.name,
                    productUrl: product.url,
                    oldPrice: previousState.price,
                    newPrice: scrapeResult.price
                  });
                }

                // 2. Back-in-stock alert
                if (
                  previousState.in_stock === false &&
                  scrapeResult.inStock === true
                ) {
                  await alerts.sendBackInStockAlert({
                    recipient: product.alert_email,
                    productName: scrapeResult.title || product.name,
                    productUrl: product.url,
                    price: scrapeResult.price
                  });
                }
              } catch (alertErr) {
                console.error(`[cron] Alert error for product ${product.id}:`, alertErr.message);
              }
            }
          } catch (dbErr) {
            console.error(`[cron] DB write error for product ${product.id}:`, dbErr.message);
            results.failed++;
            results.errors.push({ id: product.id, error: dbErr.message });
          }
        } else {
          // --- Failed scrape — log only, never write price_history ---
          try {
            await db.saveScrapeLog(
              product.id,
              "FAILED",
              scrapeResult.attempts,
              scrapeResult.error || "Scrape failed without explicit error",
              durationMs
            );
            results.failed++;
            console.warn(
              `[cron] ❌ Product ${product.id} FAILED: ${scrapeResult.error}`
            );
          } catch (dbErr) {
            console.error(`[cron] DB log error for product ${product.id}:`, dbErr.message);
          }
        }
      }
    } finally {
      // Always release the lock — even if something unexpected throws
      cronJobRunning = false;
      const totalMs = Date.now() - runStart;
      console.log(
        `[cron] Run complete in ${totalMs}ms — ` +
        `${results.success} succeeded, ${results.failed} failed.`
      );
    }
  })();
});

// ---------------------------------------------------------------------------
// Server startup
// ---------------------------------------------------------------------------

// Start server if this file is run directly
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Server listening on port ${PORT}`);
  });
}

module.exports = { app, getCronJobRunning: () => cronJobRunning }; // Export for testing
