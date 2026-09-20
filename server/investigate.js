const { chromium } = require('playwright');
async function run() {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.goto('https://demo.inelabteamdev.com/product/2');
  
  // kill cookie overlay from DOM completely to avoid intercept
  await page.evaluate(() => {
    const el = document.querySelector('.cookie-overlay');
    if (el) el.remove();
  });
  
  const block = page.locator('.price-block');
  await block.waitFor({ state: 'visible' });
  await block.hover();
  
  // Wiggle
  const box = await block.boundingBox();
  await page.mouse.move(box.x + 10, box.y + 10, { steps: 2 });
  await page.mouse.move(box.x + 20, box.y + 20, { steps: 2 });
  
  const btn = page.locator('button[aria-label="Reveal price"]');
  await btn.waitFor({ state: 'visible' });
  
  console.log('Waiting for button to enable...');
  await page.waitForFunction(() => {
    const b = document.querySelector('button[aria-label="Reveal price"]');
    return b && !b.disabled;
  }, { timeout: 10000 });
  
  console.log('Clicking...');
  await btn.click();
  
  await page.waitForTimeout(3000); // wait for price
  
  const html = await page.evaluate(() => {
    const b = document.querySelector('.price-block');
    return b ? b.outerHTML : '';
  });
  console.log('HTML:\n', html);
  await browser.close();
}
run().catch(console.error);
