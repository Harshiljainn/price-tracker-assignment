const { chromium } = require('playwright');
async function run() {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.goto('https://demo.inelabteamdev.com/product/2', {waitUntil: 'domcontentloaded'});
  
  // wait for cookie overlay explicitly
  try {
    const overlay = page.locator('.cookie-overlay');
    await overlay.waitFor({ state: 'visible', timeout: 5000 });
    console.log('Cookie overlay found, clicking accept');
    await page.click('button[aria-label="Accept cookies"]');
    await overlay.waitFor({ state: 'hidden', timeout: 5000 });
  } catch (e) {
    console.log('No cookie overlay found in 5s');
  }
  
  const block = page.locator('.price-block').first();
  await block.waitFor({ state: 'visible' });
  await block.scrollIntoViewIfNeeded();
  await block.hover();
  
  const box = await block.boundingBox();
  await page.mouse.move(box.x + 20, box.y + 20, { steps: 3 });
  await page.mouse.move(box.x + 30, box.y + 30, { steps: 3 });
  
  const btn = page.getByRole('button', { name: /reveal price/i });
  await btn.waitFor({ state: 'visible' });
  await page.waitForFunction(() => {
    const b = document.querySelector('button[aria-label="Reveal price"]');
    return b && !b.disabled;
  }, { timeout: 15000 });
  
  await btn.click();
  await page.waitForSelector('.price-block.price-success, .price-block.price-error, .stock-badge', { timeout: 15000 });
  
  const html = await page.evaluate(() => {
    const b = document.querySelector('.price-block');
    return b ? b.innerHTML : 'no .price-block';
  });
  console.log('\n--- HTML ---');
  console.log(html);
  
  const text = await page.evaluate(() => {
    const b = document.querySelector('.price-block');
    return b ? b.innerText : 'no text';
  });
  console.log('\n--- TEXT ---');
  console.log(text);
  
  await browser.close();
}
run().catch(console.error);
