const { chromium } = require('playwright');

async function run() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  console.log('=== Investigation 1: Stock text patterns ===');
  const testIds = [850, 851, 852, 853, 854, 855, 856, 857];
  
  for (const id of testIds) {
    const url = `https://demo.inelabteamdev.com/product/${id}`;
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 }).catch(() => {});
    await page.waitForTimeout(1500); // Wait for hydration
    
    // Attempt reveal to make sure stock badge is fully populated
    try {
      const priceBlock = page.locator('.price-block').last();
      await priceBlock.waitFor({ state: 'visible', timeout: 3000 });
      await priceBlock.hover();
      // small wiggle
      const box = await priceBlock.boundingBox();
      await page.mouse.move(box.x + 10, box.y + 10);
      await page.mouse.move(box.x + 20, box.y + 20);
      
      const btn = page.getByRole('button', { name: /reveal price/i });
      await btn.waitFor({ state: 'visible', timeout: 2000 });
      // wait until not disabled
      await page.waitForFunction((el) => !el.disabled, await btn.elementHandle(), { timeout: 3000 });
      await btn.click();
      await page.waitForTimeout(500); // give it time to render
    } catch(e) {}
    
    const info = await page.evaluate(() => {
      const h1 = document.querySelector('h1')?.textContent.trim();
      const badge = document.querySelector('.stock-badge')?.textContent.trim();
      const body = document.body.innerText;
      const skuMatch = body.match(/SKU[:\s]*([A-Z0-9-]+)/i);
      
      // Look for EXACT DOM element containing the SKU
      const els = [...document.querySelectorAll('*')].filter(el => {
         return el.textContent && el.textContent.trim().startsWith('SKU ') && el.children.length === 0;
      }).map(el => ({ tag: el.tagName, class: el.className, text: el.textContent }));
      
      return { h1, badge, skuFound: skuMatch ? skuMatch[1] : null, skuEls: els };
    });
    
    console.log(`Product ${id}:`);
    console.log(`  Title: ${info.h1}`);
    console.log(`  SKU in text: ${info.skuFound}`);
    console.log(`  SKU elements: ${JSON.stringify(info.skuEls)}`);
    console.log(`  Stock Badge: "${info.badge}"`);
  }

  console.log('\n=== Investigation 2: SKU Resolution via UI Search ===');
  // How does a user actually find a product by SKU? 
  // Let's go to home page, find search bar, and type a SKU.
  await page.goto('https://demo.inelabteamdev.com/', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1500);
  
  // Find search input
  try {
    // Assuming there's an input type=search or placeholder search
    const searchInput = page.locator('input[type="search"], input[placeholder*="search" i]').first();
    const isVisible = await searchInput.isVisible();
    console.log(`Search input visible: ${isVisible}`);
    
    if (isVisible) {
      // Type the SKU we found for product 851 (DOM-10851)
      await searchInput.fill('DOM-10851');
      await searchInput.press('Enter');
      
      console.log('Waiting for search results...');
      await page.waitForTimeout(3000);
      
      // Look at the first result link
      const firstResult = await page.evaluate(() => {
        const links = [...document.querySelectorAll('a[href*="/product/"]')];
        if (links.length > 0) return links[0].href;
        return null;
      });
      console.log(`First search result URL for DOM-10851: ${firstResult}`);
    }
  } catch(e) {
    console.log('Error during search test:', e.message.slice(0, 100));
  }
  
  await browser.close();
}

run().catch(console.error);
