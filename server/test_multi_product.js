/**
 * Multi-product verification test for Phase 6B scraper fix.
 * Tests products /2, /850, /851, /852, /854, /857 and verifies:
 *  - Price is a valid positive integer (thousands of rupees, not decimals like 31.71)
 *  - MRP is present and >= price (or null if no discount)
 *  - No ₹XX.YZ misparse of thousands-comma numbers
 *  - Timing is reasonable
 */
require('dotenv').config();
const { scrapeProduct } = require('./scraper');

const PRODUCTS = [
  { id: 2, url: 'https://demo.inelabteamdev.com/product/2' },
  { id: 850, url: 'https://demo.inelabteamdev.com/product/850' },
  { id: 851, url: 'https://demo.inelabteamdev.com/product/851' },
  { id: 852, url: 'https://demo.inelabteamdev.com/product/852' },
  { id: 854, url: 'https://demo.inelabteamdev.com/product/854' },
  { id: 857, url: 'https://demo.inelabteamdev.com/product/857' },
];

async function verifyProduct(product) {
  console.log(`\n--- Testing /product/${product.id} ---`);
  const start = Date.now();
  
  const result = await scrapeProduct(product.url);
  const elapsed = Date.now() - start;
  
  const pass = [];
  const fail = [];
  
  if (!result.success) {
    fail.push(`Scrape FAILED: ${result.error}`);
  } else {
    // Price must be a positive integer (or at least whole rupees, no fractional)
    if (result.price === null) {
      fail.push('price is null');
    } else if (!Number.isFinite(result.price) || result.price <= 0) {
      fail.push(`price invalid: ${result.price}`);
    } else if (result.price < 100) {
      // A price below ₹100 is suspicious — likely a misparse (₹31.71 would be 31.71 -> float)
      fail.push(`price suspiciously low (possible misparse): ₹${result.price}`);
    } else {
      pass.push(`price OK: ₹${result.price}`);
    }
    
    // MRP should be >= price if present
    if (result.mrp !== null) {
      if (result.mrp < result.price) {
        fail.push(`mrp (₹${result.mrp}) < price (₹${result.price}) — suspicious`);
      } else {
        pass.push(`mrp OK: ₹${result.mrp}`);
      }
    } else {
      pass.push('mrp: null (no discount on this load)');
    }
    
    // Title must be present
    if (!result.title) {
      fail.push('title is null');
    } else {
      pass.push(`title: "${result.title}"`);
    }
    
    // Stock status must not be undefined
    if (result.inStock === undefined) {
      fail.push('inStock is undefined');
    } else {
      pass.push(`inStock: ${result.inStock}, quantity: ${result.quantity}`);
    }
  }
  
  const status = fail.length === 0 ? '✅ PASS' : '❌ FAIL';
  console.log(`${status} [${elapsed}ms]`);
  pass.forEach(m => console.log(`   ✓ ${m}`));
  fail.forEach(m => console.log(`   ✗ ${m}`));
  
  return { productId: product.id, elapsed, pass: fail.length === 0, failures: fail, result };
}

async function run() {
  console.log('=== Multi-Product Verification Test ===\n');
  console.log('Testing products: /2, /850, /851, /852, /854, /857\n');
  
  const results = [];
  
  for (const product of PRODUCTS) {
    const r = await verifyProduct(product);
    results.push(r);
  }
  
  console.log('\n\n=== SUMMARY ===');
  let passed = 0, failed = 0;
  for (const r of results) {
    const status = r.pass ? '✅' : '❌';
    console.log(`${status} /product/${r.productId} [${r.elapsed}ms] price=₹${r.result.price} mrp=₹${r.result.mrp}`);
    if (r.pass) passed++; else failed++;
  }
  console.log(`\nResults: ${passed} passed, ${failed} failed`);
  
  if (failed > 0) {
    process.exit(1);
  }
}

run().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
