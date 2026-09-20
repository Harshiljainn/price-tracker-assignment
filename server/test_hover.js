const { chromium } = require('playwright');
async function run() {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.goto('https://demo.inelabteamdev.com/product/2');
  await page.waitForTimeout(2000);
  
  await page.evaluate(() => {
    const el = document.querySelector('.cookie-overlay');
    if (el) el.remove();
  });
  
  const block = page.locator('.price-block').first();
  await block.scrollIntoViewIfNeeded();
  
  const box = await block.boundingBox();
  console.log('Bounding Box:', box);
  
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 5 });
  await page.waitForTimeout(1000);
  
  const btn = page.locator('button[aria-label="Reveal price"]');
  console.log('Button disabled?', await btn.isDisabled());
  
  if (await btn.isDisabled()) {
    console.log('Trying alternative wiggle...');
    await page.mouse.move(box.x + 5, box.y + 5);
    await page.mouse.move(box.x + 50, box.y + 50);
    await page.waitForTimeout(1000);
    console.log('Button disabled?', await btn.isDisabled());
  }
  
  // if still disabled, maybe we just dispatch an event directly to the element?
  await block.dispatchEvent('mousemove');
  await page.waitForTimeout(1000);
  console.log('After dispatchEvent, button disabled?', await btn.isDisabled());
  
  await btn.click({ force: true });
  await page.waitForTimeout(3000);
  
  const html = await page.evaluate(() => {
    const b = document.querySelector('.price-block');
    return b ? b.outerHTML : '';
  });
  console.log('HTML:\n', html);

  await page.screenshot({ path: 'product2.png' });
  await block.screenshot({ path: 'product2_block.png' });
  
  await browser.close();
}
run();
