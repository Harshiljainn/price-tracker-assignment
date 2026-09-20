const { chromium } = require('playwright');
const fs = require('fs');

async function investigateProduct(url) {
  console.log(`\n=== Investigating ${url} ===`);
  const startTime = Date.now();
  let timings = {};

  function mark(label) {
    const now = Date.now();
    timings[label] = now - startTime;
    console.log(`[${now - startTime}ms] ${label}`);
  }

  const browser = await chromium.launch({ headless: true });
  mark('Browser launched');
  
  const context = await browser.newContext();
  const page = await context.newPage();
  
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 });
    mark('Navigated');

    try {
      const cookieOverlay = page.locator(".cookie-overlay");
      const overlayVisible = await cookieOverlay.isVisible({ timeout: 3000 });

      if (overlayVisible) {
        console.log(`Cookie consent overlay detected — dismissing...`);
        const acceptBtn = page.locator('button[aria-label="Accept cookies"]');
        await acceptBtn.click({ timeout: 5000 });
        await cookieOverlay.waitFor({ state: "hidden", timeout: 5000 });
      }
    } catch (e) {
      console.log('No cookie overlay handled');
    }
    mark('Cookie check done');

    const block = page.locator('.price-block').first();
    await block.waitFor({ state: 'visible', timeout: 10000 });
    mark('Price block visible');

    await block.scrollIntoViewIfNeeded();
    await block.hover();
    const box = await block.boundingBox();
    
    // Quick wiggle
    await page.mouse.move(box.x + 20, box.y + 20, { steps: 3 });
    await page.mouse.move(box.x + 30, box.y + 30, { steps: 3 });
    mark('Hover completed');

    const btn = page.getByRole('button', { name: /reveal price/i });
    await btn.waitFor({ state: 'visible', timeout: 8000 });
    
    const initiallyDisabled = await btn.isDisabled();
    if (initiallyDisabled) {
      await page.waitForFunction(() => {
        const b = document.querySelector('button[aria-label="Reveal price"]');
        return b && !b.disabled;
      }, { timeout: 15000 });
    }
    mark('Button enabled');

    await btn.click();
    mark('Button clicked');

    await page.waitForSelector('.price-block.price-success, .price-block.price-error, .stock-badge', { timeout: 10000 });
    mark('Reveal result detected');

    // Dump DOM of price block
    const domInfo = await page.evaluate(() => {
      const b = document.querySelector('.price-block');
      if (!b) return null;
      
      const clone = b.cloneNode(true);
      // strip some boring attributes for cleaner output
      clone.querySelectorAll('*').forEach(el => {
        el.removeAttribute('style'); // wait, styles might be important, let's keep them if they relate to font size
      });
      
      // Get all child text nodes
      const allText = b.innerText;
      
      // Get specific computed styles for fonts
      const fontInfo = [...b.querySelectorAll('*')].map(el => {
        const style = window.getComputedStyle(el);
        return {
          tag: el.tagName,
          class: el.className,
          text: el.innerText.trim(),
          fontSize: style.fontSize,
          fontWeight: style.fontWeight,
          textDecoration: style.textDecoration
        };
      }).filter(el => el.text.length > 0);
      
      return {
        html: b.innerHTML,
        innerText: allText,
        fontInfo
      };
    });

    console.log('\n--- DOM HTML ---');
    console.log(domInfo.html);
    
    console.log('\n--- innerText ---');
    console.log(domInfo.innerText);

    console.log('\n--- Font Info ---');
    console.table(domInfo.fontInfo);
    
  } catch (e) {
    console.error('Error:', e.message);
  } finally {
    await browser.close();
    mark('Browser closed');
  }
}

async function run() {
  await investigateProduct('https://demo.inelabteamdev.com/product/2');
}

run().catch(console.error);
