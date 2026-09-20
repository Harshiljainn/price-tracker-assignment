const { chromium } = require('playwright');

// Deep investigation: How does SKU link to product URL?
// Previous finding: SKU AMP-10850, product is /product/850 (not /product/10850)
// The home page shows products with VIEW DETAILS links - let's follow them

async function run() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  console.log('=== Getting home page product links ===');
  await page.goto('https://demo.inelabteamdev.com', { waitUntil: 'domcontentloaded', timeout: 20000 });
  await page.waitForTimeout(3000);
  
  const homeLinks = await page.evaluate(() => {
    return [...document.querySelectorAll('a')].map(a => ({
      href: a.href,
      text: a.textContent.trim().slice(0, 80)
    })).filter(l => l.href && l.text).slice(0, 30);
  });
  console.log('Home links:', JSON.stringify(homeLinks, null, 2));

  // Try clicking "VIEW DETAILS" for a product to see the URL
  const viewDetails = page.getByText('VIEW DETAILS →').first();
  try {
    await viewDetails.click({ timeout: 5000 });
    await page.waitForTimeout(2000);
    const detailUrl = page.url();
    console.log('\nDetail URL after clicking VIEW DETAILS:', detailUrl);
    
    const bodyInfo = await page.evaluate(() => {
      const body = document.body.innerText;
      const skuMatch = body.match(/SKU[:\s]+([A-Z0-9-]+)/i);
      const h1 = document.querySelector('h1')?.textContent.trim();
      return { sku: skuMatch ? skuMatch[1] : null, title: h1 };
    });
    console.log('Page SKU:', bodyInfo.sku, 'Title:', bodyInfo.title);
  } catch(e) {
    console.log('Failed to click VIEW DETAILS:', e.message.slice(0, 100));
  }

  // Try the search with a known SKU from the first search test: HEL-10788
  console.log('\n=== Searching for specific SKU HEL-10788 ===');
  await page.goto('https://demo.inelabteamdev.com', { waitUntil: 'domcontentloaded', timeout: 20000 });
  await page.waitForTimeout(2000);
  
  // Find SKU HEL-10788 on the page 
  const skuElement = page.getByText('HEL-10788').first();
  try {
    await skuElement.waitFor({ timeout: 5000 });
    const nearLink = await page.evaluate(() => {
      // Find element containing HEL-10788 and its parent anchor or sibling anchor
      const els = [...document.querySelectorAll('*')].filter(el => el.textContent.trim() === 'SKU HEL-10788');
      if (els.length === 0) return null;
      const el = els[0];
      // Walk up to find a parent card/article
      let card = el.parentElement;
      for (let i = 0; i < 5; i++) {
        const links = card.querySelectorAll('a[href]');
        if (links.length > 0) {
          return [...links].map(l => l.href);
        }
        card = card.parentElement;
        if (!card) break;
      }
      return null;
    });
    console.log('Links near HEL-10788:', nearLink);
  } catch(e) {
    console.log('SKU element not found:', e.message.slice(0, 80));
  }

  // Look at the search route more carefully with network inspection
  console.log('\n=== Intercepting network requests on search ===');
  const requests = [];
  page.on('request', req => {
    if (req.url().includes('/api/') || req.url().includes('search') || req.url().includes('product')) {
      requests.push({ url: req.url(), method: req.method() });
    }
  });
  page.on('response', async resp => {
    if (resp.url().includes('/api/') && resp.status() < 400) {
      try {
        const body = await resp.text();
        if (body.length < 2000) console.log('API response from', resp.url(), ':', body.slice(0, 500));
      } catch(e) {}
    }
  });
  
  await page.goto('https://demo.inelabteamdev.com/search?q=HEL-10788', { waitUntil: 'networkidle', timeout: 20000 });
  await page.waitForTimeout(3000);
  
  console.log('Network requests:', JSON.stringify(requests.slice(0, 20), null, 2));
  
  const searchPageInfo = await page.evaluate(() => {
    const links = [...document.querySelectorAll('a[href*="/product"]')].map(a => ({
      href: a.href,
      text: a.textContent.trim().slice(0, 80)
    }));
    const bodyText = document.body.innerText.slice(0, 800);
    return { links, bodyText };
  });
  console.log('Search page links:', JSON.stringify(searchPageInfo.links, null, 2));
  console.log('Search body:', searchPageInfo.bodyText);

  await browser.close();
}

run().catch(console.error);
