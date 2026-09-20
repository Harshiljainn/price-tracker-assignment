const { chromium } = require('playwright');
async function run() {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.goto('https://demo.inelabteamdev.com/product/2');
  
  await page.evaluate(() => {
    const el = document.querySelector('.cookie-overlay');
    if (el) el.remove();
  });
  
  const block = page.locator('.price-block').first();
  await block.waitFor({ state: 'visible' });
  
  // force reveal
  await page.evaluate(() => {
    const btn = document.querySelector('button[aria-label="Reveal price"]');
    if (btn) {
      btn.disabled = false;
      btn.click();
    }
  });
  
  await page.waitForTimeout(3000); // wait for price-success
  
  const html = await page.evaluate(() => {
    const b = document.querySelector('.price-block');
    return b ? b.outerHTML : '';
  });
  console.log('HTML:\n', html);
  await browser.close();
}
run();
