require('dotenv').config();
const { chromium } = require('playwright');
const { extractPriceData } = require('./scraper'); // the real extraction logic

const RUNS_FOR_PRODUCT_2 = 3;

async function runSingleTest(url, label) {
  console.log(`\n  [${label}] Fetching and clicking...`);
  const browser = await chromium.launch({ headless: true });
  
  try {
    const context = await browser.newContext({
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      viewport: { width: 1280, height: 800 },
    });
    const page = await context.newPage();
    await page.goto(url, { waitUntil: 'domcontentloaded' });

    // Handle cookie overlay
    const overlayLoc = page.locator('.cookie-overlay');
    if (await overlayLoc.isVisible({ timeout: 3000 }).catch(() => false)) {
      const acceptBtn = overlayLoc.locator('button', { hasText: /accept/i });
      if (await acceptBtn.isVisible().catch(() => false)) {
        await acceptBtn.click({ force: true }).catch(() => {});
      }
      await page.evaluate(() => {
        const el = document.querySelector('.cookie-overlay');
        if (el) el.remove();
      });
    }

    // Force remove any straggling overlays
    await page.evaluate(() => {
      document.querySelectorAll('.cookie-overlay').forEach(el => el.remove());
    });

    const block = page.locator('.price-block').first();
    await block.waitFor({ state: 'visible', timeout: 5000 });
    await block.scrollIntoViewIfNeeded();
    await block.hover();

    const box = await block.boundingBox();
    if (box) {
      const centerY = box.y + box.height / 2;
      for (let i = 0; i < 16; i++) {
        await page.mouse.move(box.x + 20 + (i % 8) * 12, centerY + (i % 2) * 4, { steps: 3 });
        await page.waitForTimeout(50);
      }
    }

    const btn = page.getByRole('button', { name: /reveal price/i });
    await btn.waitFor({ state: 'visible', timeout: 5000 });
    
    // Wait for the button to be enabled
    if (await btn.isDisabled()) {
      await page.waitForFunction(() => {
        const b = document.querySelector('button[aria-label="Reveal price"]');
        return b && !b.disabled;
      }, { timeout: 10000 });
    }
    
    await btn.click({ force: true });
    
    // Wait for reveal
    await page.waitForSelector('.price-block.price-success, .price-block.price-error, .stock-badge', { timeout: 15000 });

    // --- NOW CAPTURE RAW DOM ---
    const domData = await page.evaluate(() => {
      function normalize(str) {
        if (!str) return '';
        return str
          .replace(/[\uFF10-\uFF19]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0xff10 + 48))
          .replace(/\u200b/g, '');
      }

      const pb = document.querySelector('.price-block');
      if (!pb) return null;

      // Primary selectors (what the fixed scraper uses)
      const pvEl = pb.querySelector('[class*="pv-q9"]');
      const mrEl = pb.querySelector('[class*="mr-q9"]');

      // Hidden elements (what the scraper should NOT pick)
      const priceValueEl = pb.querySelector('.price-value');
      const amountEl = pb.querySelector('.amount[data-price="true"]');

      const stockEl = pb.querySelector('.stock-badge');

      return {
        pv_raw: pvEl ? normalize(pvEl.textContent.trim()) : null,
        mr_raw: mrEl ? normalize(mrEl.textContent.trim()) : null,
        pv_display: pvEl ? pvEl.style.display : null,
        priceValue_raw: priceValueEl ? normalize(priceValueEl.textContent.trim()) : null,
        priceValue_display: priceValueEl ? priceValueEl.style.display : null,
        amount_raw: amountEl ? normalize(amountEl.textContent.trim()) : null,
        amount_display: amountEl ? amountEl.style.display : null,
      };
    });

    // --- CALL ACTUAL SCRAPER PARSER ON THE EXACT SAME PAGE STATE ---
    const result = await extractPriceData(page);

    function parseExpected(raw) {
      if (!raw) return null;
      const cleaned = raw.replace(/[^\d,.]/g, '').trim();
      const value = parseFloat(cleaned.replace(/,/g, ''));
      return value > 0 && value < 10000000 ? value : null;
    }

    const expectedPrice = parseExpected(domData.pv_raw);
    const expectedMrp = parseExpected(domData.mr_raw);

    const match = result.price === expectedPrice;
    
    let allOk = match;
    const issues = [];
    if (!match) issues.push(`Scraper extracted ${result.price}, but DOM pv-q9 had "${domData.pv_raw}" (expected ${expectedPrice})`);
    
    if (result.price < 100) {
      issues.push(`Suspiciously low price: ${result.price} (likely misparsed a decimal)`);
      allOk = false;
    }

    // Verify hidden elements weren't used by mistake
    const hiddenPriceVal = parseExpected(domData.priceValue_raw);
    if (hiddenPriceVal === result.price && result.price !== expectedPrice) {
      issues.push(`Scraper grabbed HIDDEN .price-value (${hiddenPriceVal}) instead of visible .pv-q9`);
      allOk = false;
    }

    const status = allOk ? '✅' : '❌';
    console.log(`  ${status} ${label}`);
    console.log(`     DOM raw pv-q9 text: "${domData.pv_raw}"  → expected: ${expectedPrice}`);
    console.log(`     Scraper extracted price: ${result.price}`);
    if (domData.mr_raw) console.log(`     DOM raw mr-q9 text: "${domData.mr_raw}"  → expected: ${expectedMrp}, Scraper MRP: ${result.mrp}`);
    if (domData.priceValue_raw) console.log(`     DOM hidden price-value: "${domData.priceValue_raw}" (display: ${domData.priceValue_display})`);
    if (domData.amount_raw) console.log(`     DOM hidden amount: "${domData.amount_raw}" (display: ${domData.amount_display})`);
    
    if (issues.length > 0) {
      issues.forEach(i => console.log(`     ⚠️  ${i}`));
    }

    return allOk;
  } catch (err) {
    console.log(`  ❌ ${label} crashed: ${err.message}`);
    return false;
  } finally {
    await browser.close();
  }
}

async function run() {
  console.log('='.repeat(60));
  console.log('  Single-Session DOM Match Verification');
  console.log('='.repeat(60));

  let passed = 0;
  let failed = 0;

  console.log(`\n\n--- Product /2 (3 runs to capture multiple prices) ---`);
  for (let run = 1; run <= RUNS_FOR_PRODUCT_2; run++) {
    const ok = await runSingleTest('https://demo.inelabteamdev.com/product/2', `/product/2 run#${run}`);
    if (ok) passed++; else failed++;
  }

  const otherProducts = [850, 851, 854];
  for (const id of otherProducts) {
    console.log(`\n--- Product /${id} ---`);
    const ok = await runSingleTest(`https://demo.inelabteamdev.com/product/${id}`, `/product/${id}`);
    if (ok) passed++; else failed++;
  }

  console.log('\n' + '='.repeat(60));
  console.log(`  Results: ${passed} passed, ${failed} failed`);
  console.log('='.repeat(60));

  if (failed > 0) {
    process.exit(1);
  }
}

run().catch(console.error);
