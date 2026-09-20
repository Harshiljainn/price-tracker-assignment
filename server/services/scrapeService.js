const db = require('../db');
const alerts = require('../alerts');
const { scrapeProduct } = require('../scraper');

/**
 * Runs a scrape for a given product, compares state, and sends alerts if needed.
 * This unifies manual and cron scraping logic.
 * 
 * @param {Object} product - The product from the DB to scrape
 * @param {string} [globalAlertEmail] - Optional, to avoid re-fetching in cron loop
 * @returns {Promise<Object>} scrapeResult with additional success indicator
 */
async function runScrapeAndAlert(product, globalAlertEmail = null) {
  const startTime = Date.now();
  let previousState = null;
  let result = null;
  let durationMs = 0;

  try {
    // 1. Fetch previous state
    const history = await db.getPriceHistory(product.id, 1);
    if (history && history.length > 0) {
      previousState = history[0];
    }

    // 2. Scrape
    const scrapeResult = await scrapeProduct(product.url, { headless: true });
    durationMs = Date.now() - startTime;
    
    // Scraper error
    if (!scrapeResult.success || scrapeResult.price === null) {
      await db.saveScrapeLog(
        product.id,
        "FAILED",
        scrapeResult.attempts || 1,
        scrapeResult.error || "Scrape failed without explicit error or price was null",
        durationMs
      ).catch(e => console.error(`[scrapeService] Failed to write error log: ${e.message}`));
      
      return {
        success: false,
        error: scrapeResult.error,
        attempts: scrapeResult.attempts || 1,
        durationMs
      };
    }

    // 3. Save successful scrape data
    await db.savePriceHistory(
      product.id,
      scrapeResult.price,
      scrapeResult.mrp,
      scrapeResult.inStock,
      scrapeResult.quantity
    );
    
    if (scrapeResult.title && scrapeResult.title !== product.name) {
      await db.updateProductName(product.id, scrapeResult.title);
    }
    
    await db.saveScrapeLog(
      product.id,
      "SUCCESS",
      scrapeResult.attempts,
      "Scrape completed successfully",
      durationMs
    );

    result = {
      success: true,
      price: scrapeResult.price,
      mrp: scrapeResult.mrp,
      inStock: scrapeResult.inStock,
      quantity: scrapeResult.quantity,
      durationMs
    };

    // 4. Alerts
    // Fetch global alert email if not provided
    if (globalAlertEmail === null) {
      try {
        globalAlertEmail = await db.getGlobalAlertEmail();
      } catch (err) {
        console.error(`[scrapeService] Failed to fetch global alert email:`, err.message);
      }
    }

    if (previousState && globalAlertEmail) {
      // 4a. Price Change Alert
      if (
        typeof previousState.price === 'number' &&
        typeof scrapeResult.price === 'number' &&
        previousState.price !== scrapeResult.price
      ) {
        await alerts.sendPriceChangeAlert({
          recipient: globalAlertEmail,
          productName: scrapeResult.title || product.name,
          productUrl: product.url,
          oldPrice: previousState.price,
          newPrice: scrapeResult.price
        }).catch(err => console.error(`[scrapeService] Price alert failed:`, err.message));
      }

      // 4b. Stock Change Alert
      if (
        previousState.in_stock !== null && 
        scrapeResult.inStock !== null && 
        previousState.in_stock !== scrapeResult.inStock
      ) {
        if (scrapeResult.inStock === true) {
          await alerts.sendBackInStockAlert({
            recipient: globalAlertEmail,
            productName: scrapeResult.title || product.name,
            productUrl: product.url,
            price: scrapeResult.price
          }).catch(err => console.error(`[scrapeService] Stock alert failed:`, err.message));
        }
      }
    }

    return result;

  } catch (err) {
    // Top-level failure (e.g. DB error)
    console.error(`[scrapeService] Unexpected error for product ${product.id}:`, err.message);
    if (!durationMs) durationMs = Date.now() - startTime;
    await db.saveScrapeLog(
      product.id,
      "FAILED",
      0,
      `Unexpected error: ${err.message}`,
      durationMs
    ).catch(e => console.error(`[scrapeService] Failed to write error log:`, e.message));

    return {
      success: false,
      error: `Unexpected error: ${err.message}`,
      attempts: 0,
      durationMs
    };
  }
}

module.exports = {
  runScrapeAndAlert
};
