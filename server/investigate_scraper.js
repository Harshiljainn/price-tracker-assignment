const { chromium } = require('playwright');

const testUrls = [
  "https://demo.inelabteamdev.com/product/850",
  "https://demo.inelabteamdev.com/product/851",
  "https://demo.inelabteamdev.com/product/852",
  "https://demo.inelabteamdev.com/product/853",
  "https://demo.inelabteamdev.com/product/854",
  "https://demo.inelabteamdev.com/product/855",
  "https://demo.inelabteamdev.com/product/856",
  "https://demo.inelabteamdev.com/product/857"
];

async function run() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  
  for (const url of testUrls) {
    const page = await context.newPage();
    console.log(`\n=============================\nTesting ${url}...`);
    try {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 20000 });
      
      const titleEl = await page.locator("h1").first().textContent().catch(() => null);
      console.log(`Title: ${titleEl ? titleEl.trim() : "NOT FOUND"}`);

      try {
        const cookieOverlay = page.locator(".cookie-overlay");
        if (await cookieOverlay.isVisible({ timeout: 2000 })) {
          const acceptBtn = page.locator('button[aria-label="Accept cookies"]');
          await acceptBtn.click({ timeout: 2000 });
          await cookieOverlay.waitFor({ state: "hidden", timeout: 2000 });
        }
      } catch(e) {}
      
      const block = page.locator(".price-block").first();
      await block.waitFor({ state: "visible", timeout: 15000 });
      await block.scrollIntoViewIfNeeded();
      await block.hover();
      
      const box = await block.boundingBox();
      if (!box) {
         console.log("No bounding box");
         await page.close();
         continue;
      }
      
      const centerY = box.y + box.height / 2;
      for (let i = 0; i < 16; i++) {
        await page.mouse.move(box.x + 20 + (i % 8) * 12, centerY + (i % 2) * 4, { steps: 3 });
        await page.waitForTimeout(60);
      }
      
      const btn = page.getByRole("button", { name: /reveal price/i });
      await btn.waitFor({ state: "visible", timeout: 5000 });
      await page.waitForFunction(() => {
        const b = document.querySelector('button[aria-label="Reveal price"]');
        return b && !b.disabled;
      }, { timeout: 10000 }).catch(()=>{});
      
      await btn.click({ force: true, timeout: 5000 });
      await page.waitForTimeout(6000);
      
      const extracted = await page.locator(".price-block").last().evaluate(priceBlock => {
        function normalize(str) {
          if (!str) return "";
          return str.replace(/[\uFF10-\uFF19]/g, ch => String.fromCharCode(ch.charCodeAt(0) - 0xff10 + 48))
                    .replace(/\u200b/g, "");
        }
        function isVisible(el) {
          const st = window.getComputedStyle(el);
          return st.display !== "none" && st.visibility !== "hidden" && el.getAttribute("aria-hidden") !== "true";
        }
        function getFontSizePx(el) {
          return parseFloat(window.getComputedStyle(el).fontSize) || 0;
        }
        function hasPriceAndCurrency(text) {
          const t = normalize(text);
          return (t.match(/\d/g) || []).length >= 2 && /₹|INR/i.test(t);
        }
        
        const allEls = [...priceBlock.querySelectorAll("*")];
        const candidates = [];
        const mrpCandidates = [];

        for (const el of allEls) {
          if (!isVisible(el)) continue;
          
          const st = window.getComputedStyle(el);
          const isStruck = st.textDecoration.includes("line-through") || el.style.textDecoration.includes("line-through");

          if (isStruck) {
            const t = normalize(el.textContent);
            if ((t.match(/\d/g) || []).length >= 2) {
              let childHasIt = false;
              for (const child of el.children) {
                 if ((normalize(child.textContent).match(/\d/g) || []).length >= 2) childHasIt = true;
              }
              if (!childHasIt) mrpCandidates.push(el);
            }
            continue; 
          }

          if (!hasPriceAndCurrency(el.textContent)) continue;
          let childHasIt = false;
          for (const child of el.children) {
             if (hasPriceAndCurrency(child.textContent)) childHasIt = true;
          }
          if (!childHasIt) candidates.push({ el, text: normalize(el.textContent), fs: getFontSizePx(el) });
        }

        candidates.sort((a, b) => b.fs - a.fs);
        mrpCandidates.sort((a, b) => getFontSizePx(b) - getFontSizePx(a));
        
        const badge = priceBlock.querySelector(".stock-badge") || document.querySelector(".stock-badge");
        
        return {
          price: candidates.length > 0 ? candidates[0].text : null,
          mrp: mrpCandidates.length > 0 ? normalize(mrpCandidates[0].textContent) : null,
          stock: badge ? badge.textContent.trim() : null,
          allCandidates: candidates,
          html: candidates.length === 0 ? priceBlock.outerHTML : null
        };
      });
      
      console.log("Extracted:", JSON.stringify({ ...extracted, html: extracted.html ? "PRESENT" : "NONE" }, null, 2));
      if (extracted.html) {
        console.log("HTML Dump:\n" + extracted.html);
      }
    } catch (e) {
      console.log("Error:", e.message);
    }
    await page.close();
  }
  await browser.close();
}

run().catch(console.error);
