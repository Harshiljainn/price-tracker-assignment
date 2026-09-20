const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();
  const urls = [
    'https://demo.inelabteamdev.com/product/2', 
    'https://demo.inelabteamdev.com/product/850',
    'https://demo.inelabteamdev.com/product/851',
    'https://demo.inelabteamdev.com/product/12',
    'https://demo.inelabteamdev.com/product/15'
  ];
  
  for (const url of urls) {
    console.log('\n--- Investigating ' + url + ' ---');
    try {
      const t0 = Date.now();
      await page.goto(url, { waitUntil: 'domcontentloaded' });
      const t1 = Date.now();
      console.log('Nav:', t1-t0, 'ms');
      
      // Cookie overlay
      await page.evaluate(() => {
        document.querySelectorAll('.cookie-overlay').forEach(el => el.remove());
      });
      
      // Hover
      const block = page.locator('.price-block').first();
      await block.waitFor({ state: 'visible', timeout: 15000 });
      const box = await block.boundingBox();
      if (!box) continue;
      const centerY = box.y + box.height / 2;
      for (let i = 0; i < 16; i++) {
        await page.mouse.move(box.x + 20 + (i % 8) * 12, centerY + (i % 2) * 4, { steps: 3 });
        await page.waitForTimeout(60);
      }
      
      // Click reveal
      const btn = page.getByRole('button', { name: /reveal price/i });
      await btn.waitFor({ state: 'visible' });
      const t2 = Date.now();
      console.log('Hover + Wait for btn:', t2-t1, 'ms');
      
      if (await btn.isDisabled()) {
        await page.waitForFunction(() => {
          const b = document.querySelector('button[aria-label="Reveal price"]');
          return b && !b.disabled;
        }, { timeout: 15000 });
      }
      const t3 = Date.now();
      console.log('Btn enabled in:', t3-t2, 'ms');
      
      await page.evaluate(() => {
        document.querySelectorAll('.cookie-overlay').forEach(el => el.remove());
      });
      
      await btn.click({ force: true });
      
      // Wait for reveal
      await page.waitForSelector('.price-block.price-success, .price-block.price-error', { timeout: 35000 });
      const t4 = Date.now();
      console.log('Reveal took:', t4-t3, 'ms');
      console.log('Total time:', t4-t0, 'ms');
      
      const html = await block.evaluate(el => el.outerHTML);
      console.log('Price block HTML:', html);
    } catch (e) {
      console.error(e.message);
    }
  }
  await browser.close();
})();
