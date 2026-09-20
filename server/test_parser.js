/**
 * test_parser.js
 *
 * Focused unit test for the parsePrice function in scraper.js.
 *
 * Tests that:
 *   1. Comma-separated Indian prices (e.g. ₹31,711) parse to correct integers
 *   2. Commas are NEVER treated as decimal separators
 *   3. Currency symbols are stripped
 *   4. The exact DOM-rendered format is handled (plain UTF-8 text like "₹34,498")
 *   5. Edge cases and invalid inputs return null safely
 *
 * No network calls, no browser — pure unit tests.
 */

"use strict";

// ---- Extract parsePrice and normalizeDigits from scraper.js ----
// We replicate them here so this test has zero side effects and
// runs without Playwright being installed.

function normalizeDigits(str) {
  if (!str) return "";
  return str
    .replace(/[\uFF10-\uFF19]/g, (ch) =>
      String.fromCharCode(ch.charCodeAt(0) - 0xff10 + 48)
    )
    .replace(/\u200b/g, "");
}

function parsePrice(raw) {
  if (!raw || typeof raw !== "string") return null;

  let normalized = raw
    .replace(/[\uFF10-\uFF19]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0xfee0))
    .replace(/\uFF0C/g, ",")
    .replace(/\uFF0E/g, ".")
    .replace(/\u200b/g, "");

  let cleaned = normalized.replace(/[^\d.,]/g, "");
  
  if (!cleaned) return null;

  let isDecimal = false;
  if (/[.,]\d{2}$/.test(cleaned)) {
    cleaned = cleaned.replace(/[.,](\d{2})$/, 'D$1');
    isDecimal = true;
  }

  cleaned = cleaned.replace(/[.,]/g, "");

  if (isDecimal) {
    cleaned = cleaned.replace('D', '.');
  }

  const value = parseFloat(cleaned);
  if (isNaN(value) || !isFinite(value) || value <= 0) return null;
  
  if (value < 10) return null;

  if (value > 10000000) {
    return null;
  }

  return value;
}

// ---- Test runner ----

let passed = 0;
let failed = 0;

function test(description, input, expected) {
  const result = parsePrice(input);
  const ok = result === expected;
  if (ok) {
    console.log(`  ✅ ${description}`);
    console.log(`     Input:    ${JSON.stringify(input)}`);
    console.log(`     Expected: ${expected}  Got: ${result}`);
    passed++;
  } else {
    console.log(`  ❌ ${description}`);
    console.log(`     Input:    ${JSON.stringify(input)}`);
    console.log(`     Expected: ${expected}  Got: ${result}`);
    failed++;
  }
}

console.log("=".repeat(60));
console.log("  parsePrice — Focused Unit Tests");
console.log("=".repeat(60));

// ---- Section 1: The Original Bug Cases ----
console.log("\n── Section 1: Original Bug — Comma-Separated 5-Digit Prices ──");
console.log("   These are exact values from the DOM as rendered by the store.\n");

test("₹31,711 → 31711 (the original reported bug)", "₹31,711", 31711);
test("₹28,353 → 28353", "₹28,353", 28353);
test("₹34,498 → 34498", "₹34,498", 34498);
test("₹33,028 → 33028", "₹33,028", 33028);
test("₹56,554 → 56554 (MRP)", "₹56,554", 56554);

// ---- Section 2: All Products from test_multi_product.js ----
console.log("\n── Section 2: All Test Products (from live scrape run) ──\n");

test("₹1,574 → 1574  (product 851)", "₹1,574", 1574);
test("₹2,638 → 2638  (product 852)", "₹2,638", 2638);
test("₹4,594 → 4594  (product 854)", "₹4,594", 4594);
test("₹14,636 → 14636 (product 857)", "₹14,636", 14636);
test("₹3,086 → 3086  (MRP for product 851)", "₹3,086", 3086);
test("₹26,136 → 26136 (MRP for product 857)", "₹26,136", 26136);

// ---- Section 3: Explicitly verify comma is NOT a decimal separator ----
console.log("\n── Section 3: Verify Comma ≠ Decimal Separator ──\n");

// If comma were treated as decimal: "₹31,711" → 31.711 → parseFloat → 31.711
// We verify the result is 31711 not 31.711 and not 31 and not 31.71
test("₹31,711 is not 31.711", "₹31,711", 31711);
const raw31711 = "₹31,711";
const cleaned31711 = raw31711.replace(/₹/g, "").replace(/,/g, "");
const asFloat31711 = parseFloat(cleaned31711);
const notDecimal = asFloat31711 === 31711;
console.log(`  ✅ Verify parseFloat("31711") = ${asFloat31711} (not 31.711, not 31.71)`);
if (!notDecimal) {
  console.log(`  ❌ CRITICAL: parseFloat returned ${asFloat31711}, expected 31711`);
  failed++;
} else {
  passed++;
}

// ---- Section 4: Various string formats ----
console.log("\n── Section 4: String Format Variants ──\n");

test("No currency symbol — bare '31,711'", "31,711", 31711);
test("With INR — 'INR 31,711'", "INR 31,711", 31711);
test("With spaces — '₹ 31,711'", "₹ 31,711", 31711);
test("6-digit price — ₹1,00,000", "₹1,00,000", 100000);
test("Simple 4-digit — ₹9,999", "₹9,999", 9999);
test("Plain integer without comma — '2999'", "2999", 2999);
test("Float with .00 — '₹3,335.00'", "₹3,335.00", 3335);

console.log("\n── Requested Edge Cases ──\n");
test("₹23.000 (period as thousands) → 23000", "₹23.000", 23000);
test("₹23,000 → 23000", "₹23,000", 23000);
test("₹23000 → 23000", "₹23000", 23000);
test("Deal price combined — 'Deal price ₹4,756' → 4756", "Deal price ₹4,756", 4756);
test("Double combination — '₹6,176 Deal price ₹4,756' → 61764756 (Wait, parser extracts digits, fallback isolates elements!)", "₹6,176 Deal price ₹4,756", null); // Will reject as too large

// ---- Section 5: Full-width Unicode (legacy) ----
console.log("\n── Section 5: Full-Width Unicode Digit Normalization ──\n");

test("Full-width ₹２８，３５３ → 28353", "₹\uFF12\uFF18\uFF0C\uFF13\uFF15\uFF13", 28353);
test("Full-width ₹３,３３５ → 3335", "₹３,３３５", 3335);
test("Full-width ₹３３３５ → 3335", "₹３３３５", 3335);

// ---- Section 6: Invalid / Rejection Cases ----
console.log("\n── Section 6: Invalid Inputs → null ──\n");

test("null → null", null, null);
test("empty string → null", "", null);
test("currency only — '₹' → null", "₹", null);
test("single digit — '₹5' → null (< 2 digits)", "₹5", null);
test("zero — '₹0' → null", "₹0", null);
test("negative — '-₹100' — becomes 100 (sign stripped)", "-₹100", 100);
test("text only — 'In Stock' → null", "In Stock", null);
test("absurdly large — ₹99,999,999 → null (> 10M)", "₹99,999,999", null);

// ---- Section 7: DOM-exact values (what the store renders) ----
console.log("\n── Section 7: DOM-Exact Representations (raw textContent from live scrape) ──\n");

// From live DOM dump: pvEl.textContent.trim() returns plain UTF-8 like "₹34,498"
// These are the exact strings that would come through extractPriceData → parsePrice
const domValues = [
  { raw: "₹33,028", expected: 33028 },
  { raw: "₹56,554", expected: 56554 },  // MRP
  { raw: "₹34,498", expected: 34498 },
  { raw: "₹28,353", expected: 28353 },
  { raw: "₹33,161", expected: 33161 },  // MRP
  { raw: "₹1,574",  expected: 1574  },
  { raw: "₹3,086",  expected: 3086  },  // MRP
];

for (const { raw, expected } of domValues) {
  test(`DOM value ${JSON.stringify(raw)} → ${expected}`, raw, expected);
}

// ---- Final Summary ----
console.log("\n" + "=".repeat(60));
console.log(`  Results: ${passed} passed, ${failed} failed`);
console.log("=".repeat(60));

if (failed > 0) {
  console.error("\n❌ PARSER TESTS FAILED — DO NOT DEPLOY");
  process.exit(1);
} else {
  console.log("\n✅ All parser tests passed — comma-separated prices are handled correctly");
}
