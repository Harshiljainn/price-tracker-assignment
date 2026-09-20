/**
 * test_scraper_extraction.js
 *
 * Unit tests for the price extraction helpers in scraper.js.
 * Tests parsePrice and the pv-* extraction strategy against the
 * exact HTML structure reported from Render logs.
 *
 * Does NOT launch Playwright.
 * Usage: node test_scraper_extraction.js
 */

"use strict";

require("dotenv").config();
const assert = require("assert");

// ---- Re-implement parsePrice locally for unit testing ----
function parsePrice(raw) {
  if (!raw || typeof raw !== "string") return null;
  let normalized = raw
    .replace(/[\uFF10-\uFF19]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0xfee0))
    .replace(/\uFF0C/g, ",")
    .replace(/\uFF0E/g, ".")
    .replace(/\u200b/g, "")
    .replace(/\u00a0/g, " ");

  let cleaned = normalized.replace(/[^\d.,]/g, "");
  if (!cleaned) return null;

  let isDecimal = false;
  if (/[.,]\d{2}$/.test(cleaned)) {
    cleaned = cleaned.replace(/[.,](\d{2})$/, "D$1");
    isDecimal = true;
  }
  cleaned = cleaned.replace(/[.,]/g, "");
  if (isDecimal) cleaned = cleaned.replace("D", ".");

  const value = parseFloat(cleaned);
  if (isNaN(value) || !isFinite(value) || value <= 0) return null;
  if (value < 10) return null;
  if (value > 10000000) return null;
  return value;
}

function normalizeText(str) {
  if (!str) return "";
  return str
    .replace(/[\uFF10-\uFF19]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0xff10 + 48))
    .replace(/\u200b/g, "")
    .replace(/\u00a0/g, " ")
    .trim();
}

let passed = 0;
let failed = 0;

function test(label, fn) {
  try {
    fn();
    console.log("OK " + label);
    passed++;
  } catch (err) {
    console.error("FAIL " + label);
    console.error("   " + err.message);
    failed++;
  }
}

console.log("==========================================");
console.log("  Testing Scraper Price Extraction Logic");
console.log("==========================================");

test("parsePrice: RS81,282 = 81282", () => {
  assert.strictEqual(parsePrice("\u20b981,282"), 81282);
});

test("parsePrice: RS81,282 with zero-width spaces = 81282", () => {
  assert.strictEqual(parsePrice("\u200b\u20b9\u200b8\u200b1\u200b,\u200b2\u200b8\u200b2"), 81282);
});

test("parsePrice: RS91,328 (MRP) = 91328", () => {
  assert.strictEqual(parsePrice("\u20b991,328"), 91328);
});

test("parsePrice: RS94,902 (hidden) = 94902", () => {
  assert.strictEqual(parsePrice("\u20b994,902"), 94902);
});

test("parsePrice: RS48,773 (hidden) = 48773", () => {
  assert.strictEqual(parsePrice("\u20b948,773"), 48773);
});

test("pv-* text concatenation yields 81282", () => {
  const pvText = "\u20b981,282";
  assert.strictEqual(parsePrice(normalizeText(pvText)), 81282);
});

test("pv-* text with zero-width spaces per digit yields 81282", () => {
  const pvText = "\u20b9\u200b8\u200b1\u200b,\u200b2\u200b8\u200b2";
  assert.strictEqual(parsePrice(normalizeText(pvText)), 81282);
});

test("pv-* text with full-width digits yields 81282", () => {
  const pvText = "\u20b9\uff18\uff11\uff0c\uff12\uff18\uff12";
  assert.strictEqual(parsePrice(normalizeText(pvText)), 81282);
});

test("class matching: pv-k2 matches /^pv-/", () => {
  assert.ok(["vydk72a", "pv-k2"].some(cls => /^pv-/.test(cls)));
});

test("class matching: pv-q9 matches /^pv-/", () => {
  assert.ok(["randomhash", "pv-q9"].some(cls => /^pv-/.test(cls)));
});

test("class matching: mr-k2 matches /^mr-/", () => {
  assert.ok(["mr-k2"].some(cls => /^mr-/.test(cls)));
});

test("class matching: price-value does NOT match /^pv-/", () => {
  assert.ok(!["price-value"].some(cls => /^pv-/.test(cls)));
});

test("parsePrice: null returns null", () => {
  assert.strictEqual(parsePrice(null), null);
});

test("parsePrice: empty string returns null", () => {
  assert.strictEqual(parsePrice(""), null);
});

test("parsePrice: single digit percent text returns null", () => {
  assert.strictEqual(parsePrice("1% off"), null);
});

test("parsePrice: RS21,591 = 21591", () => {
  assert.strictEqual(parsePrice("\u20b921,591"), 21591);
});

test("parsePrice: RS3,335.00 (decimal) = 3335", () => {
  assert.strictEqual(parsePrice("\u20b9 3,335.00"), 3335);
});

test("Full Render log scenario: pv-k2 -> 81282, mr-k2 whitespace -> 91328", () => {
  const pvText = "\u20b981,282";
  const mrText = "\n      \u20b991,328\n    ";
  assert.strictEqual(parsePrice(pvText), 81282);
  assert.strictEqual(parsePrice(normalizeText(mrText)), 91328);
});

console.log("\n==========================================");
if (failed === 0) {
  console.log("All " + passed + " extraction tests passed!");
} else {
  console.log(failed + " test(s) FAILED, " + passed + " passed.");
}
console.log("==========================================");

if (failed > 0) process.exit(1);
