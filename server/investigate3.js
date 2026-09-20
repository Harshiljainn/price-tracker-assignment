const { chromium } = require('playwright');
async function run() {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.goto('https://demo.inelabteamdev.com/product/2');
  
  // Accept cookies
  try {
    await page.waitForSelector('.cookie-overlay', { timeout: 3000 });
    await page.click('button[aria-label="Accept cookies"]');
    await page.waitForTimeout(1000);
  } catch (e) {}
  
  const block = page.locator('.price-block');
  await block.waitFor({ state: 'visible' });
  await block.hover();
  
  // Wiggle
  const box = await block.boundingBox();
  await page.mouse.move(box.x + 10, box.y + 10, { steps: 2 });
  await page.mouse.move(box.x + 20, box.y + 20, { steps: 2 });
  
  const btn = page.locator('button[aria-label="Reveal price"]');
  await btn.waitFor({ state: 'visible' });
  
  // Wait until enabled
  await page.waitForFunction(() => {
    const b = document.querySelector('button[aria-label="Reveal price"]');
    return b && !b.disabled;
  }, { timeout: 15000 });
  
  await btn.click();
  
  // Just wait 3 seconds and dump HTML!
  await page.waitForTimeout(3000);
  
  const html = await page.evaluate(() => {
    const b = document.querySelector('.price-block');
    return b ? b.outerHTML : '';
  });
  console.log('HTML:\n', html);
  
  const text = await page.evaluate(() => {
    const b = document.querySelector('.price-block');
    return b ? b.innerText : '';
  });
  console.log('TEXT:\n', text);
  
  await browser.close();
}
run();
