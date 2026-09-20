"use strict";

/**
 * scraper.js
 *
 * Core Playwright scraper for the INE demo store (demo.inelabteamdev.com).
 *
 * The store is a React SPA that hides prices behind a "Reveal price" interaction:
 *   1. The .price-block element must be scrolled into view and hovered.
 *   2. A mouse-wiggle gesture convinces the store's anti-bot detector to
 *      enable the "Reveal price" button (which starts disabled).
 *   3. Once the button is enabled, click it.
 *   4. Wait for .price-block.price-success (or .price-block.price-error or
 *      .stock-badge) to appear in the DOM.
 *   5. Extract the revealed price from the <output> element.
 *      The store renders EACH DIGIT as a separate <span> inside <output>,
 *      using full-width Unicode digits (U+FF10–U+FF19: ０１２３４５６７８９).
 *      We must:
 *        a) Read the complete textContent of <output>, NOT individual child spans.
 *        b) Normalize full-width digits to ASCII before parseFloat().
 *        c) Strip the ₹ symbol, commas, and zero-width spaces (U+200B).
 *   6. MRP (if any) lives in a struck-through sibling container element —
 *      again read as a whole, not span-by-span.
 *   7. Stock is determined from .stock-badge text; "Only N left" counts as
 *      in-stock.
 *
 * Interaction sequence reverse-engineered from _probe_playwright3.js and
 * _probe_playwright2.js. Price structure reverse-engineered from bundle.js
 * (_inspect_price*.js, _tmp.js).
 */

const { chromium } = require("playwright");

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MAX_ATTEMPTS = 3;

/**
 * Flat retry delay between attempts (ms). Kept short because:
 * - The reveal failure is almost always caused by the store's anti-bot
 *   detector needing a moment, not a permanent block.
 * - Each full attempt already takes several seconds.
 * - We do NOT use exponential backoff — 3 × 3s = 9s of pure sleeping per product.
 */
const BASE_RETRY_DELAY_MS = 1000;

/** Navigation timeout — 15s is plenty for a fast VPS-hosted demo store. */
const NAV_TIMEOUT_MS = 15000;

/** How long to wait for .price-block to appear after page load. */
const PRICE_BLOCK_WAIT_MS = 5000;

/**
 * How long the adaptive hover gesture is allowed to run before giving up
 * waiting for the button to become enabled.
 */
const HOVER_MAX_WAIT_MS = 4000;

/** How long to wait for the button to be enabled after it first appears. */
const BUTTON_ENABLED_WAIT_MS = 2000;

/** How long to wait after clicking for .price-success / .price-error. */
const REVEAL_RESULT_WAIT_MS = 8000;

/**
 * Non-retryable error patterns — failures where retrying wastes time and
 * will never succeed.
 */
const HARD_FAILURE_PATTERNS = [
  /404/i,
  /page not found/i,
  /invalid url/i,
  /product not found/i,
  /navigation timeout/i,
  /ERR_NAME_NOT_RESOLVED/i,
  /ERR_CONNECTION_REFUSED/i,
];

function isHardFailure(message) {
  return HARD_FAILURE_PATTERNS.some((p) => p.test(message));
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Normalize full-width Unicode digits (U+FF10–U+FF19) to ASCII digits (0–9).
 * The store's Lr() function (see _tmp.js) also inserts U+200B zero-width
 * spaces before every digit — strip those here too.
 *
 * @param {string} str
 * @returns {string}
 */
function normalizeDigits(str) {
  if (!str) return "";
  return str
    // Full-width digits: ０ = U+FF10, ９ = U+FF19
    .replace(/[\uFF10-\uFF19]/g, (ch) =>
      String.fromCharCode(ch.charCodeAt(0) - 0xff10 + 48)
    )
    // Zero-width spaces inserted by the store's Lr() obfuscation function
    .replace(/\u200b/g, "");
}

/**
 * Parse an Indian-rupee price string into a positive finite number.
 *
 * Accepts strings like "₹21,591", "21591", "1,299.00", "２１，５９１".
 * Rejects single-digit or zero values — a real product price is never < 2 digits.
 *
 * @param {string|null} raw - Normalized text from a DOM element.
 * @returns {number|null} Parsed price, or null if invalid.
 */
function parsePrice(raw) {
  if (!raw || typeof raw !== "string") return null;

  // 1. Normalize Unicode full-width digits and full-width punctuation
  let normalized = raw
    .replace(/[\uFF10-\uFF19]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0xfee0)) // Digits ０-９ to 0-9
    .replace(/\uFF0C/g, ",") // Full-width comma ， to ,
    .replace(/\uFF0E/g, ".") // Full-width period ． to .
    .replace(/\u200b/g, ""); // Zero-width space

  // 2. Strip everything except ASCII digits, commas, and decimal points
  let cleaned = normalized.replace(/[^\d.,]/g, "");
  
  if (!cleaned) return null;

  // 3. Handle decimal vs thousands separator ambiguity
  // If the string ends with a dot or comma followed by EXACTLY two digits, it is a decimal (.00)
  // e.g. "3,335.00" or "23.30"
  let isDecimal = false;
  if (/[.,]\d{2}$/.test(cleaned)) {
    // Replace the final separator with a temporary marker 'D'
    cleaned = cleaned.replace(/[.,](\d{2})$/, 'D$1');
    isDecimal = true;
  }

  // 4. Remove all remaining dots and commas (they must be thousands separators now)
  // This correctly turns "23.000" into "23000" and "3,335" into "3335"
  cleaned = cleaned.replace(/[.,]/g, "");

  // 5. Restore the decimal point if one existed
  if (isDecimal) {
    cleaned = cleaned.replace('D', '.');
  }

  const value = parseFloat(cleaned);
  if (isNaN(value) || !isFinite(value) || value <= 0) return null;
  
  // Reject values that are fewer than 2 digits — no real product costs ₹1
  if (value < 10) return null;

  // Reject absurdly large prices (e.g. > 10,000,000)
  if (value > 10000000) {
    return null;
  }

  return value;
}

/**
 * Determine in-stock status from badge text.
 *
 * Explicit truthy patterns:
 *   "IN STOCK", "In Stock", "Only 51 left", "5 left", "available"
 * Explicit falsy patterns:
 *   "Out of stock", "out-of-stock", "Unavailable", "Sold out"
 * Everything else → null (honest uncertainty).
 *
 * @param {string} badgeText
 * @returns {boolean|null}
 */
function parseStock(badgeText) {
  if (!badgeText) return null;
  const t = badgeText.toLowerCase().trim();

  // Positive signals
  if (
    t.includes("in stock") ||
    t.includes("in-stock") ||
    t.includes("available") ||
    /only\s+\d+\s+left/i.test(t) ||
    /\d+\s+left/i.test(t) ||
    /\d+\s+in stock/i.test(t)
  ) {
    return true;
  }

  // Negative signals
  if (
    t.includes("out of stock") ||
    t.includes("out-of-stock") ||
    t.includes("unavailable") ||
    t.includes("sold out")
  ) {
    return false;
  }

  return null; // do not assume
}

/**
 * Determine exact numeric quantity from stock badge text, if explicitly provided.
 *
 * Examples:
 *   "Only 166 left" -> 166
 *   "Hurry, just 129 left" -> 129
 *   "52 in stock" -> 52
 *   "Out of stock" -> null
 *   "In Stock" -> null
 *
 * @param {string} badgeText
 * @returns {number|null}
 */
function parseQuantity(badgeText) {
  if (!badgeText) return null;
  const t = badgeText.trim();
  
  if (/out of stock|out-of-stock|unavailable|sold out/i.test(t)) {
    return null;
  }
  
  // Match a number followed by 'left' or 'in stock'
  const match = t.match(/(\d+)\s+(left|in\s+stock)/i);
  if (match) {
    return parseInt(match[1], 10);
  }
  
  return null;
}

/**
 * Extract price, mrp, and stock status from the revealed .price-block.
 *
 * DOM STRUCTURE (as of Sep 2026 — after store redesign):
 *
 *   <div class="price-block price-success pw-q9">
 *     <div class="price-main">
 *       <span class="price-value" aria-hidden="true" style="display:none">₹29,836</span>  ← hidden, skip
 *       <span class="mr-q9" style="text-decoration: line-through;">₹56,554</span>          ← MRP
 *       <b class="{random} pv-q9" style="font-size: 2.4rem; font-weight: 700;">₹34,498</b> ← SELLING PRICE
 *       <span class="bd-q9">39% off</span>
 *       <span class="amount" data-price="true" aria-hidden="true" style="display:none">₹34,412</span> ← hidden, skip
 *     </div>
 *     <div class="price-facets">
 *       <span class="stock-badge in-stock">Hurry, just 199 left</span>
 *     </div>
 *   </div>
 *
 * UNIFIED SCORING ALGORITHM:
 *   Scores every visible leaf node. Penalizes "deal/off/%" text heavily (−100),
 *   rewards pv-q9 class (+50), currency symbol (+10), bold element (+5).
 *   Struck-through elements → MRP candidates.
 *   Falls back to font-size tie-breaking only when semantic signals tie.
 *   Returns null if no candidate scores ≥ 0 (e.g. all visible text is discount labels).
 *
 * NOTE: Several elements carry aria-hidden="true" or display:none — always
 * check isVisible() to skip these.
 *
 * @param {import('playwright').Page} page
 * @returns {Promise<{price: number|null, mrp: number|null, inStock: boolean|null, quantity: number|null, title: string|null}>}
 */
async function extractPriceData(page) {
  const raw = await page.evaluate(() => {
    function normalize(str) {
      if (!str) return "";
      return str
        .replace(/[\uFF10-\uFF19]/g, (ch) =>
          String.fromCharCode(ch.charCodeAt(0) - 0xff10 + 48)
        )
        .replace(/\u200b/g, "");
    }

    function isVisible(el) {
      const st = window.getComputedStyle(el);
      return (
        st.display !== "none" &&
        st.visibility !== "hidden" &&
        el.getAttribute("aria-hidden") !== "true"
      );
    }

    function getFontSizePx(el) {
      return parseFloat(window.getComputedStyle(el).fontSize) || 0;
    }

    function hasPriceAndCurrency(text) {
      const t = normalize(text);
      return (t.match(/\d/g) || []).length >= 2 && /₹|INR/i.test(t);
    }

    // Extract title from h1
    const titleEl = document.querySelector("h1");
    const titleText = titleEl ? titleEl.textContent.trim() : null;

    const blocks = document.querySelectorAll(".price-block");
    const priceBlock = blocks[blocks.length - 1];
    if (!priceBlock) return { priceText: null, mrpText: null, stockText: "", titleText };

    const badge =
      priceBlock.querySelector(".stock-badge") ||
      document.querySelector(".stock-badge");
    const stockText = badge ? badge.textContent.trim() : "";

    // ---- UNIFIED SCORING ALGORITHM FOR PRICES ----
    let priceText = null;
    let mrpText = null;

    const allEls = [...priceBlock.querySelectorAll("*")];
    const candidates = [];
    const mrpCandidates = [];

    for (const el of allEls) {
      if (!isVisible(el)) continue;

      const text = normalize(el.textContent.trim());
      // Must have some numbers to be a price
      if (!/\d/.test(text)) continue;
      
      // We only want leaf nodes (or nodes where the text is directly inside it, not just a massive container)
      // A good heuristic: if any child also contains numbers, skip the parent.
      let childHasNumbers = false;
      for (const child of el.children) {
        if (/\d/.test(normalize(child.textContent))) {
          childHasNumbers = true;
          break;
        }
      }
      if (childHasNumbers) continue;

      const st = window.getComputedStyle(el);
      const isStruck = st.textDecoration.includes("line-through") || el.style.textDecoration.includes("line-through") || el.classList.contains("mr-q9");
      
      if (isStruck) {
        mrpCandidates.push({ el, text, fs: getFontSizePx(el) });
        continue;
      }

      // It's a candidate for the final price. Let's score it!
      let score = 0;
      
      const lowerText = text.toLowerCase();
      
      // Penalties for deal labels, off percentages, etc.
      if (lowerText.includes("deal") || lowerText.includes("save") || lowerText.includes("off") || lowerText.includes("%") || lowerText.includes("mrp")) {
        score -= 100;
      }

      // Bonus for being the exact class
      if (el.classList.contains("pv-q9")) {
        score += 50;
      }

      // Bonus for explicit currency symbol
      if (lowerText.includes("₹") || lowerText.includes("inr")) {
        score += 10;
      }

      // Bonus for bold
      if (st.fontWeight === "700" || st.fontWeight === "bold" || el.tagName.toLowerCase() === "b" || el.tagName.toLowerCase() === "strong") {
        score += 5;
      }
      
      // Add a tiny bit of score based on font size (e.g. 24px = 2.4 score) to break ties
      score += getFontSizePx(el) / 10;

      candidates.push({ el, text, score });
    }

    // Sort by highest score first
    candidates.sort((a, b) => b.score - a.score);
    mrpCandidates.sort((a, b) => b.fs - a.fs); // For MRP, largest struck-through is fine

    if (candidates.length > 0 && candidates[0].score >= 0) {
      // If the top score is extremely negative (e.g. all remaining elements were "deal 50% off"), return null
      priceText = candidates[0].text;
    }
    
    if (mrpCandidates.length > 0) {
      mrpText = mrpCandidates[0].text;
    }

    return { priceText, mrpText, stockText, titleText };
  });

  const price = parsePrice(raw.priceText);
  const mrp = parsePrice(raw.mrpText);
  const inStock = parseStock(raw.stockText);
  const quantity = parseQuantity(raw.stockText);

  return { price, mrp, inStock, quantity, stockText: raw.stockText, title: raw.titleText };
}

// ---------------------------------------------------------------------------
// Core: one attempt (receives a pre-existing page for browser reuse)
// ---------------------------------------------------------------------------

/**
 * Perform a single scrape attempt for a given product URL.
 * Accepts an existing Playwright Page so the browser is not relaunched on retry.
 *
 * @param {import('playwright').Page} page
 * @param {string} url       - Full product URL.
 * @param {number} attemptNum - 1-based attempt number (for logging).
 * @returns {Promise<{price, mrp, inStock, quantity, title, timings}>}
 * @throws {Error} on any failure. Hard failures have .isHardFailure = true.
 */
async function attemptScrapeWithPage(page, url, attemptNum) {
  const tag = `[attempt ${attemptNum}/${MAX_ATTEMPTS}]`;
  const t0 = Date.now();
  const timings = {};

  // ---- Step 1: Navigate ----
  console.log(`${tag} Navigating to: ${url}`);
  const tNav0 = Date.now();
  try {
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: NAV_TIMEOUT_MS });
  } catch (navErr) {
    const hardErr = new Error(`Navigation failed: ${navErr.message}`);
    hardErr.isHardFailure = isHardFailure(navErr.message);
    throw hardErr;
  }
  timings.navigation = Date.now() - tNav0;
  console.log(`${tag} DOM loaded. [nav: ${timings.navigation}ms]`);

  // ---- Check for hard 404 / missing product ----
  const pageTitle = await page.title().catch(() => "");
  if (/not found|404/i.test(pageTitle)) {
    const hardErr = new Error(`Product page not found (404): ${url}`);
    hardErr.isHardFailure = true;
    throw hardErr;
  }

  // ---- Step 2: Dismiss cookie consent overlay (fast path) ----
  const tCookie0 = Date.now();
  try {
    // Quick check — avoid 3s timeout if overlay is already gone
    const hasOverlay = await page.evaluate(() => {
      const el = document.querySelector(".cookie-overlay");
      if (!el) return false;
      const st = window.getComputedStyle(el);
      return st.display !== "none" && st.visibility !== "hidden";
    });

    if (hasOverlay) {
      console.log(`${tag} Cookie overlay detected — dismissing...`);
      // Try accept button first, fall back to DOM removal
      try {
        const acceptBtn = page.locator('button[aria-label="Accept cookies"]');
        await acceptBtn.click({ timeout: 2000, force: true });
        await page.waitForFunction(
          () => !document.querySelector(".cookie-overlay") || window.getComputedStyle(document.querySelector(".cookie-overlay")).display === "none",
          { timeout: 2000 }
        );
        console.log(`${tag} Cookie overlay dismissed via accept button.`);
      } catch {
        await page.evaluate(() => {
          document.querySelectorAll(".cookie-overlay").forEach((el) => el.remove());
        });
        console.log(`${tag} Cookie overlay removed from DOM.`);
      }
    } else {
      console.log(`${tag} No cookie overlay.`);
    }
  } catch (overlayErr) {
    console.warn(`${tag} Cookie overlay handling non-fatal: ${overlayErr.message}`);
  }
  timings.cookie = Date.now() - tCookie0;

  // ---- Step 3: Locate .price-block ----
  const tBlock0 = Date.now();
  console.log(`${tag} Waiting for .price-block...`);
  const block = page.locator(".price-block").first();
  try {
    await block.waitFor({ state: "visible", timeout: PRICE_BLOCK_WAIT_MS });
  } catch (blockErr) {
    const hardErr = new Error(`Price block not found: ${blockErr.message}`);
    // No price-block at all → likely wrong page or hard 404
    hardErr.isHardFailure = true;
    throw hardErr;
  }
  timings.priceBlock = Date.now() - tBlock0;
  console.log(`${tag} .price-block visible. [+${timings.priceBlock}ms]`);

  // ---- Step 4: Adaptive hover gesture ----
  // We wiggle the mouse over the price block. The store's anti-bot detector
  // watches mouse movement and enables the "Reveal price" button once satisfied.
  // OPTIMIZATION: Check if button is already enabled after each wiggle step;
  // stop early instead of always doing all 16 iterations.
  await block.scrollIntoViewIfNeeded();
  await block.hover();
  const box = await block.boundingBox();
  if (!box) throw new Error("Could not get bounding box of .price-block");
  const centerY = box.y + box.height / 2;

  const tHover0 = Date.now();
  console.log(`${tag} Starting adaptive hover gesture...`);

  // First make the button appear (it may already be there)
  const btn = page.getByRole("button", { name: /reveal price/i });

  let buttonEnabled = false;
  const hoverDeadline = Date.now() + HOVER_MAX_WAIT_MS;
  let wiggleStep = 0;

  while (!buttonEnabled && Date.now() < hoverDeadline) {
    // Move mouse
    const i = wiggleStep % 8;
    await page.mouse.move(
      box.x + 20 + i * 12,
      centerY + (wiggleStep % 2) * 4,
      { steps: 2 }
    );
    wiggleStep++;

    // Check if button is now visible and enabled
    const isVisible = await btn.isVisible().catch(() => false);
    if (isVisible) {
      const isDisabled = await btn.isDisabled().catch(() => true);
      if (!isDisabled) {
        buttonEnabled = true;
        break;
      }
    }

    // Short pause between moves — 30ms is enough for the store's detector
    await page.waitForTimeout(30);
  }

  timings.hover = Date.now() - tHover0;
  console.log(`${tag} Hover done (${wiggleStep} moves, buttonEnabled=${buttonEnabled}). [+${timings.hover}ms]`);

  // ---- Step 5: Ensure button is visible and enabled ----
  const tBtn0 = Date.now();
  try {
    await btn.waitFor({ state: "visible", timeout: 2000 });
    // If still disabled after hover, give it a moment
    if (await btn.isDisabled()) {
      console.log(`${tag} Button still disabled — waiting up to ${BUTTON_ENABLED_WAIT_MS}ms...`);
      await page.waitForFunction(
        () => {
          const b = document.querySelector('button[aria-label="Reveal price"]');
          return b && !b.disabled;
        },
        { timeout: BUTTON_ENABLED_WAIT_MS }
      );
    }
  } catch (btnErr) {
    throw new Error(`Reveal price button not available: ${btnErr.message}`);
  }
  timings.buttonReady = Date.now() - tBtn0;
  console.log(`${tag} Button ready. [+${timings.buttonReady}ms]`);

  // ---- Step 6: Click "Reveal price" ----
  // Force-remove any cookie overlay immediately before clicking
  await page.evaluate(() => {
    document.querySelectorAll(".cookie-overlay").forEach((el) => el.remove());
  });
  console.log(`${tag} Clicking "Reveal price"...`);

  // OPTIMIZATION: Track if the frontend actually dispatches a network request.
  // If the store's anti-bot is active, the frontend JS silently drops the click
  // and sends nothing. If we detect no network request within 1000ms, we can
  // fail early and retry, rather than waiting the full REVEAL_RESULT_WAIT_MS.
  let requestSent = false;
  const reqListener = (req) => {
    if (req.url().includes("/api/challenge") || req.url().includes("/api/products/")) {
      requestSent = true;
    }
  };
  page.on("request", reqListener);

  await btn.click({ force: true });

  // ---- Step 7: Wait for reveal result (event-driven) ----
  const tReveal0 = Date.now();
  console.log(`${tag} Waiting for reveal result...`);
  try {
    // Early exit check: wait up to 1000ms for a network request to begin
    for (let i = 0; i < 10; i++) {
      if (requestSent) break;
      await page.waitForTimeout(100);
    }
    page.off("request", reqListener);

    if (!requestSent) {
      throw new Error(`Reveal click was silently ignored by store frontend (no network request sent within 1000ms).`);
    }

    await page.waitForSelector(
      ".price-block.price-success, .price-block.price-error, .stock-badge",
      { timeout: REVEAL_RESULT_WAIT_MS }
    );
  } catch (revealErr) {
    page.off("request", reqListener);
    throw new Error(`Reveal failed: ${revealErr.message}`);
  }
  timings.reveal = Date.now() - tReveal0;

  const priceBlockClass = await page.locator(".price-block").last().getAttribute("class");
  console.log(`${tag} Revealed. classes="${priceBlockClass}" [+${timings.reveal}ms]`);

  if (priceBlockClass && priceBlockClass.includes("price-error")) {
    throw new Error(`Store returned price-error state. Classes: "${priceBlockClass}"`);
  }

  // ---- Step 8: Extract price data ----
  const tExtract0 = Date.now();
  console.log(`${tag} Extracting price data...`);
  const { price, mrp, inStock, quantity, stockText, title } = await extractPriceData(page);
  timings.extraction = Date.now() - tExtract0;
  timings.total = Date.now() - t0;

  console.log(
    `${tag} Extracted — price: ${price}, mrp: ${mrp}, ` +
    `inStock: ${inStock}, quantity: ${quantity}, stockBadge: "${stockText}", title: "${title}"`
  );
  console.log(
    `${tag} ⏱  nav:${timings.navigation}ms  cookie:${timings.cookie}ms  ` +
    `block:${timings.priceBlock}ms  hover:${timings.hover}ms  ` +
    `btnReady:${timings.buttonReady}ms  reveal:${timings.reveal}ms  ` +
    `extract:${timings.extraction}ms  TOTAL:${timings.total}ms`
  );

  // ---- Step 9: Validate — never return null price as success ----
  if (price === null) {
    const rawHtml = await page
      .locator(".price-block")
      .last()
      .evaluate((el) => el.outerHTML)
      .catch(() => "(could not read outerHTML)");
    console.error(`${tag} Raw .price-block HTML:\n${rawHtml}`);
    throw new Error(
      "Price extraction returned null — <output> element missing, " +
        "full-width digits not found, or fewer than 2 digits extracted. " +
        "Possible selector drift."
    );
  }

  return { price, mrp, inStock, quantity, title, timings };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Scrape the current price and stock status for a product URL.
 *
 * Key optimizations over previous version:
 * - Single browser launched once, reused across all retry attempts.
 * - Hard failures (404, navigation error, no price block) are not retried.
 * - Adaptive hover: stops wiggling as soon as button is enabled.
 * - Per-stage timing logged on every attempt.
 * - Flat 1s retry delay (not exponential).
 *
 * @param {string} url         - Full product URL.
 * @param {object} [opts]
 * @param {boolean} [opts.headless=true] - Run Playwright in headless mode.
 *
 * @returns {Promise<{
 *   success: boolean,
 *   url: string,
 *   price: number|null,
 *   mrp: number|null,
 *   inStock: boolean|null,
 *   quantity: number|null,
 *   title: string|null,
 *   attempts: number,
 *   error: string|null
 * }>}
 */
async function scrapeProduct(url, { headless = true } = {}) {
  if (!url || typeof url !== "string") {
    return {
      success: false,
      url: url ?? null,
      price: null,
      mrp: null,
      inStock: null,
      title: null,
      attempts: 0,
      error: "Invalid URL: must be a non-empty string.",
    };
  }

  let browser;
  let lastError = null;

  try {
    // Launch ONE browser for all attempts (saves ~3s overhead)
    browser = await chromium.launch({
      headless,
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
      ],
    });

    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      if (attempt > 1) {
        console.log(
          `[scraper] Retry ${attempt - 1} after: "${lastError}". ` +
          `Waiting ${BASE_RETRY_DELAY_MS}ms before attempt ${attempt}...`
        );
        await new Promise((r) => setTimeout(r, BASE_RETRY_DELAY_MS));
      }

      // Create a FRESH context and page for every attempt.
      // Reusing the same page triggers the store's heavy anti-bot (withholding .price-block).
      const context = await browser.newContext({
        userAgent:
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
          "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        viewport: { width: 1280, height: 800 },
      });
      const page = await context.newPage();
      page.setDefaultTimeout(NAV_TIMEOUT_MS);

      try {
        const result = await attemptScrapeWithPage(page, url, attempt);

        console.log(
          `[scraper] SUCCESS on attempt ${attempt} — ` +
          `price=${result.price} mrp=${result.mrp} inStock=${result.inStock} ` +
          `quantity=${result.quantity} title="${result.title}"`
        );

        await context.close();
        return {
          success: true,
          url,
          price: result.price,
          mrp: result.mrp,
          inStock: result.inStock,
          quantity: result.quantity,
          title: result.title,
          attempts: attempt,
          error: null,
        };
      } catch (err) {
        lastError = err.message || String(err);
        console.error(`[scraper] Attempt ${attempt} FAILED: ${lastError}`);
        await context.close();

        // Hard failures — don't waste time retrying
        if (err.isHardFailure) {
          console.error(`[scraper] Hard failure detected — skipping remaining attempts.`);
          break;
        }
      }
    }
  } finally {
    if (browser) {
      await browser.close().catch(() => {});
    }
  }

  console.error(`[scraper] All attempts failed for: ${url}`);
  return {
    success: false,
    url,
    price: null,
    mrp: null,
    inStock: null,
    quantity: null,
    title: null,
    attempts: MAX_ATTEMPTS,
    error: lastError,
  };
}

module.exports = { scrapeProduct };

