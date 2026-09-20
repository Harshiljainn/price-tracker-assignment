"use strict";
const { chromium } = require("playwright");
const fs = require("fs");

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  page.setDefaultTimeout(30000);
  await page.goto("https://demo.inelabteamdev.com/product/850", { waitUntil: "domcontentloaded" });

  try {
    const cookieOverlay = page.locator(".cookie-overlay");
    if (await cookieOverlay.isVisible({ timeout: 3000 }).catch(()=>false)) {
      await page.locator('button[aria-label="Accept cookies"]').click({ timeout: 5000 });
      await cookieOverlay.waitFor({ state: "hidden", timeout: 5000 });
    }

    // hover wiggle
    const block = page.locator(".price-block").first();
    await block.waitFor({ state: "visible" });
    await block.scrollIntoViewIfNeeded();
    await block.hover();
    const box = await block.boundingBox();
    const centerY = box.y + box.height / 2;
    for (let i = 0; i < 16; i++) {
      await page.mouse.move(box.x + 20 + (i % 8) * 12, centerY + (i % 2) * 4, { steps: 3 });
      await page.waitForTimeout(60);
    }

    const btn = page.getByRole("button", { name: /reveal price/i });
    await btn.waitFor({ state: "visible", timeout: 8000 });
    
    const initiallyDisabled = await btn.isDisabled();
    if (initiallyDisabled) {
      await page.waitForFunction(() => {
        const b = document.querySelector('button[aria-label="Reveal price"]');
        return b && !b.disabled;
      }, { timeout: 10000 });
    }

    await btn.click();
    await page.waitForSelector(".price-block.price-success, .price-block.price-error, .stock-badge", { timeout: 25000 });

    const priceBlockClass = await page.locator(".price-block").last().getAttribute("class");
    if (!priceBlockClass.includes("price-error")) {
      const rawHtml = await page.locator(".price-block").last().evaluate(el => el.outerHTML);
      fs.writeFileSync("bug_price_block.html", rawHtml);
      console.log("Dumped raw html to bug_price_block.html");
      
      const outputElText = await page.locator(".price-block").last().evaluate(el => {
        const out = el.querySelector("output");
        return out ? out.textContent : null;
      });
      console.log("Raw output textContent:", JSON.stringify(outputElText));
    }
  } catch (e) {
    console.error(e);
  } finally {
    await browser.close();
  }
})();
