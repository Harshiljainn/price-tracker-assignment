/**
 * Comprehensive DOM investigation of product/2 price block.
 * 
 * Key finding from investigation:
 *  - The cookie overlay intercepts pointer events on ALL fresh browser contexts
 *  - The scraper's cookie handling checks isVisible() then clicks, but the
 *    button appears to not be found (or the click fails to dismiss the overlay)
 *  - So the cookie overlay remains and blocks the Reveal Price click
 * 
 * Fix strategy: Use `page.locator().click({ force: true })` for cookie button,
 * OR use evaluate() to directly remove the overlay element from DOM.
 */

const { chromium } = require('playwright');

async function run() {
  console.log('=== Investigation: Cookie overlay vs price-block ===\n');
  
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    viewport: { width: 1280, height: 800 },
  });
  const page = await context.newPage();

  await page.goto('https://demo.inelabteamdev.com/product/2', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1500);

  // Inspect cookie overlay
  const overlayInfo = await page.evaluate(() => {
    const overlay = document.querySelector('.cookie-overlay');
    if (!overlay) return 'NO .cookie-overlay found';
    const style = window.getComputedStyle(overlay);
    const btn = overlay.querySelector('button[aria-label="Accept cookies"]');
    return {
      exists: true,
      display: style.display,
      visibility: style.visibility,
      pointerEvents: style.pointerEvents,
      zIndex: style.zIndex,
      acceptButtonExists: !!btn,
      acceptButtonText: btn ? btn.textContent.trim() : null,
    };
  });
  console.log('Cookie overlay info:', JSON.stringify(overlayInfo, null, 2));

  // Strategy 1: Try accept via JS click directly on button
  await page.evaluate(() => {
    const btn = document.querySelector('button[aria-label="Accept cookies"]');
    if (btn) btn.click();
  });
  await page.waitForTimeout(500);

  const overlayGone1 = await page.evaluate(() => {
    const overlay = document.querySelector('.cookie-overlay');
    const style = overlay ? window.getComputedStyle(overlay) : null;
    return { gone: !overlay, display: style ? style.display : 'N/A', visibility: style ? style.visibility : 'N/A' };
  });
  console.log('After JS click on accept btn:', overlayGone1);

  // Strategy 2: Remove from DOM entirely if still present
  await page.evaluate(() => {
    const overlay = document.querySelector('.cookie-overlay');
    if (overlay) overlay.remove();
  });

  const overlayGone2 = await page.evaluate(() => !!document.querySelector('.cookie-overlay'));
  console.log('After DOM removal - overlay still exists?', overlayGone2);

  // Now do the price reveal
  const block = page.locator('.price-block').first();
  await block.waitFor({ state: 'visible' });
  await block.scrollIntoViewIfNeeded();
  await block.hover();

  const box = await block.boundingBox();
  console.log('Price block bounding box:', box);
  
  // Wiggle
  const centerY = box.y + box.height / 2;
  for (let i = 0; i < 16; i++) {
    await page.mouse.move(
      box.x + 20 + (i % 8) * 12,
      centerY + (i % 2) * 4,
      { steps: 3 }
    );
    await page.waitForTimeout(50);
  }

  const btn = page.getByRole('button', { name: /reveal price/i });
  await btn.waitFor({ state: 'visible' });

  const isDisabled = await btn.isDisabled();
  console.log('Button disabled?', isDisabled);

  if (isDisabled) {
    console.log('Waiting for button to enable...');
    try {
      await page.waitForFunction(() => {
        const b = document.querySelector('button[aria-label="Reveal price"]');
        return b && !b.disabled;
      }, { timeout: 10000 });
      console.log('Button enabled!');
    } catch (e) {
      console.error('Button never enabled:', e.message);
    }
  }

  // Click the button
  await btn.click();
  console.log('Clicked Reveal Price button');

  // Wait for the reveal
  try {
    await page.waitForSelector('.price-block.price-success, .price-block.price-error, .stock-badge', { timeout: 10000 });
    console.log('Price revealed!');
  } catch (e) {
    console.error('Reveal timeout:', e.message);
  }

  await page.waitForTimeout(1000);

  // Dump the full price-block HTML
  const priceBlockHtml = await page.evaluate(() => {
    const b = document.querySelector('.price-block');
    return {
      outerHTML: b ? b.outerHTML : 'NOT FOUND',
      innerText: b ? b.innerText : 'NOT FOUND',
    };
  });
  console.log('\n=== Price Block HTML ===');
  console.log(priceBlockHtml.outerHTML);
  console.log('\n=== Price Block Text ===');
  console.log(priceBlockHtml.innerText);

  // Dump all output elements
  const outputInfo = await page.evaluate(() => {
    return Array.from(document.querySelectorAll('output')).map(o => ({
      outerHTML: o.outerHTML.substring(0, 500),
      textContent: o.textContent,
      innerText: o.innerText,
    }));
  });
  console.log('\n=== Output Elements ===');
  console.log(JSON.stringify(outputInfo, null, 2));

  // Take screenshot
  await page.screenshot({ path: 'product2_investigation.png' });
  console.log('\nScreenshot saved to product2_investigation.png');
  
  await browser.close();
}

run().catch(console.error);
