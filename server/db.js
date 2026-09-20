require("dotenv").config();
const { createClient } = require("@supabase/supabase-js");

// Validate environment variables
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error("Missing SUPABASE_URL or SUPABASE_KEY in environment variables.");
  // We don't throw here to avoid crashing immediately on require if someone is just inspecting,
  // but subsequent DB calls will fail if the client cannot be initialized.
}

// Initialize Supabase client
const supabase = supabaseUrl && supabaseKey ? createClient(supabaseUrl, supabaseKey) : null;

/**
 * Ensures the Supabase client is initialized before attempting operations.
 */
function checkClient() {
  if (!supabase) {
    throw new Error("Supabase client is not initialized. Check your environment variables.");
  }
}

/**
 * Creates a new tracked product or returns the existing one if the URL already exists.
 * @param {string} url - Product URL
 * @param {string} [name] - Product Name
 * @param {string} [imageUrl] - Product Image URL
 * @returns {Promise<Object>} The product record
 */
async function createTrackedProduct(url, name = null, imageUrl = null) {
  checkClient();
  
  // Try to insert, if conflict on URL, this will throw an error with code '23505'
  const { data, error } = await supabase
    .from("products")
    .insert([
      { url, name, image_url: imageUrl, is_tracked: true }
    ])
    .select()
    .single();

  if (error) {
    if (error.code === '23505') {
      const duplicateError = new Error("Product already added to track");
      duplicateError.code = 'DUPLICATE_PRODUCT';
      throw duplicateError;
    }
    throw new Error(`Failed to create tracked product: ${error.message}`);
  }

  return data;
}

/**
 * Retrieves all currently tracked products, optionally filtered by search text.
 * @param {string} [searchQuery] - Text to search in name or url
 * @returns {Promise<Array>} Array of product records
 */
async function getTrackedProducts(searchQuery = null) {
  checkClient();

  let query = supabase
    .from("products")
    .select(`
      *,
      price_history (
        price,
        mrp,
        in_stock,
        quantity
      )
    `)
    .eq("is_tracked", true);

  if (searchQuery) {
    const safeSearch = searchQuery.replace(/[%_]/g, '\\$&');
    query = query.or(`name.ilike.%${safeSearch}%,url.ilike.%${safeSearch}%`);
  }

  const { data, error } = await query
    .order("created_at", { ascending: false })
    .order("scraped_at", { foreignTable: "price_history", ascending: false })
    .limit(1, { foreignTable: "price_history" });

  if (error) {
    throw new Error(`Failed to fetch tracked products: ${error.message}`);
  }

  const formattedData = data.map(product => {
    const latestPrice = product.price_history && product.price_history.length > 0 ? product.price_history[0] : null;
    return {
      ...product,
      price: latestPrice ? latestPrice.price : null,
      mrp: latestPrice ? latestPrice.mrp : null,
      in_stock: latestPrice ? latestPrice.in_stock : null,
      quantity: latestPrice ? latestPrice.quantity : null,
    };
  });

  return formattedData;
}

/**
 * Retrieves a specific tracked product by ID.
 * @param {string} id - Product UUID
 * @returns {Promise<Object|null>} The product record or null if not found
 */
async function getTrackedProductById(id) {
  checkClient();

  const { data, error } = await supabase
    .from("products")
    .select("*")
    .eq("id", id)
    .single();

  if (error) {
    if (error.code === "PGRST116") return null; // Not found
    throw new Error(`Failed to fetch product by ID: ${error.message}`);
  }

  return data;
}

/**
 * Removes (untracks) a specific product by ID.
 * @param {string} id - Product UUID
 * @returns {Promise<boolean>} True if successful
 */
async function deleteTrackedProduct(id) {
  checkClient();

  const { error } = await supabase
    .from("products")
    .delete()
    .eq("id", id);

  if (error) {
    throw new Error(`Failed to delete product: ${error.message}`);
  }

  return true;
}

/**
 * Updates the name of a tracked product (typically after scraping the real title).
 * @param {string} id - Product UUID
 * @param {string} name - The product title/name
 * @returns {Promise<boolean>} True if successful
 */
async function updateProductName(id, name) {
  checkClient();
  const { error } = await supabase
    .from("products")
    .update({ name })
    .eq("id", id);
    
  if (error) {
    console.error(`Failed to update product name: ${error.message}`);
    return false;
  }
  return true;
}

/**
 * Saves a successful price scrape to the price_history table.
 * @param {string} productId - Product UUID
 * @param {number} price - Current price
 * @param {number|null} mrp - Maximum Retail Price (optional)
 * @param {boolean|null} inStock - Stock status (optional)
 * @param {number|null} quantity - Exact numeric quantity left (optional)
 * @returns {Promise<Object>} The inserted price history record
 */
async function savePriceHistory(productId, price, mrp, inStock, quantity = null) {
  checkClient();

  // Validate price constraint (must be positive number)
  if (typeof price !== 'number' || price <= 0) {
     throw new Error("Cannot save price history: price must be a valid positive number.");
  }

  const { data, error } = await supabase
    .from("price_history")
    .insert([
      {
        product_id: productId,
        price,
        mrp,
        in_stock: inStock,
        quantity
      }
    ])
    .select()
    .single();

  if (error) {
    throw new Error(`Failed to save price history: ${error.message}`);
  }

  return data;
}

/**
 * Saves a log of a scrape attempt (success or failure) to the scrape_logs table.
 * @param {string} productId - Product UUID
 * @param {string} status - e.g., "SUCCESS", "FAILED"
 * @param {number} attempt - The attempt number (1-3)
 * @param {string|null} message - Error message or success note
 * @param {number|null} durationMs - How long the scrape took
 * @returns {Promise<Object>} The inserted log record
 */
async function saveScrapeLog(productId, status, attempt, message, durationMs) {
  checkClient();

  const { data, error } = await supabase
    .from("scrape_logs")
    .insert([
      {
        product_id: productId,
        status,
        attempt,
        message,
        duration_ms: durationMs
      }
    ])
    .select()
    .single();

  if (error) {
    throw new Error(`Failed to save scrape log: ${error.message}`);
  }

  return data;
}

/**
 * Retrieves the price history for a specific product, ordered by most recent first.
 * @param {string} productId - Product UUID
 * @param {number} limit - Max number of records to return
 * @returns {Promise<Array>} Array of price history records
 */
async function getPriceHistory(productId, limit = 100) {
  checkClient();

  const { data, error } = await supabase
    .from("price_history")
    .select("*")
    .eq("product_id", productId)
    .order("scraped_at", { ascending: false })
    .limit(limit);

  if (error) {
    throw new Error(`Failed to fetch price history: ${error.message}`);
  }

  return data;
}

/**
 * Retrieves the scrape logs for a specific product, ordered by most recent first.
 * @param {string} productId - Product UUID
 * @param {number} limit - Max number of records to return
 * @returns {Promise<Array>} Array of scrape log records
 */
async function getScrapeLogs(productId, limit = 50) {
  checkClient();

  const { data, error } = await supabase
    .from("scrape_logs")
    .select("*")
    .eq("product_id", productId)
    .order("scraped_at", { ascending: false })
    .limit(limit);

  if (error) {
    throw new Error(`Failed to fetch scrape logs: ${error.message}`);
  }

  return data;
}

/**
 * Resolves a SKU to its actual product URL by mathematical derivation and verification.
 * The demo store uses the format SKU PREFIX-10{product_id}.
 * 
 * @param {string} sku - The SKU to resolve (e.g. 'SKU HEL-10018' or 'HEL-10018')
 * @returns {Promise<string>} The resolved product URL
 * @throws {Error} if the SKU format is invalid or if the product page returns 404
 */
async function resolveSku(sku) {
  if (!sku || typeof sku !== 'string') {
    throw new Error('Invalid SKU format');
  }

  // Clean the SKU string (remove "SKU " prefix and whitespace)
  const cleanSku = sku.replace(/^SKU\s+/i, '').trim();
  
  // Validate pattern: PREFIX-10XXX
  const match = cleanSku.match(/^[A-Z]+-(\d+)$/i);
  if (!match) {
    throw new Error('Invalid SKU format. Expected format: PREFIX-10XXX (e.g. HEL-10018)');
  }
  
  const numericSuffix = parseInt(match[1], 10);
  if (isNaN(numericSuffix) || numericSuffix <= 10000) {
    throw new Error('Invalid SKU format. Numeric suffix must be > 10000');
  }
  
  // Derivation: id = numericSuffix - 10000
  const productId = numericSuffix - 10000;
  
  const url = `https://demo.inelabteamdev.com/product/${productId}`;
  
  // Verify it exists using the store's public API
  const apiUrl = `https://demo.inelabteamdev.com/api/product/${productId}`;
  try {
    const response = await fetch(apiUrl);
    if (!response.ok) {
      throw new Error(`Product not found for SKU: ${cleanSku}`);
    }
    const data = await response.json();
    if (!data.sku || data.sku.toUpperCase() !== cleanSku.toUpperCase()) {
      throw new Error(`SKU mismatch. Expected ${cleanSku}, but found ${data.sku}`);
    }
  } catch (error) {
    throw new Error(`Failed to verify SKU: ${error.message}`);
  }
  
  return url;
}

/**
 * Retrieves the global alert email from app_settings.
 * @returns {Promise<string|null>} The global email or null if not set
 */
async function getGlobalAlertEmail() {
  checkClient();
  const { data, error } = await supabase
    .from("app_settings")
    .select("value")
    .eq("key", "global_alert_email")
    .single();

  if (error) {
    if (error.code === "PGRST116") return null; // No row found
    throw new Error(`Failed to get global alert email: ${error.message}`);
  }
  return data ? data.value : null;
}

/**
 * Sets or updates the global alert email in app_settings.
 * @param {string} email - The email to set
 * @returns {Promise<boolean>} True if successful
 */
async function setGlobalAlertEmail(email) {
  checkClient();
  const { error } = await supabase
    .from("app_settings")
    .upsert(
      { key: "global_alert_email", value: email },
      { onConflict: "key" }
    );

  if (error) {
    throw new Error(`Failed to set global alert email: ${error.message}`);
  }
  return true;
}

module.exports = {
  supabase,
  createTrackedProduct,
  getTrackedProducts,
  getTrackedProductById,
  deleteTrackedProduct,
  savePriceHistory,
  saveScrapeLog,
  getPriceHistory,
  getScrapeLogs,
  updateProductName,
  resolveSku,
  getGlobalAlertEmail,
  setGlobalAlertEmail
};
