"use strict";
// _probe_cookie_overlay.js  — one-off investigation, NOT production code
const { chromium } = require("playwright");

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  page.setDefaultTimeout(20000);
  await page.goto("https://demo.inelabteamdev.com/product/850", {
    waitUntil: "domcontentloaded",
  });

  // Wait a moment for React to hydrate
  await page.waitForTimeout(2000);

  // Does the overlay exist at all?
  const count = await page.locator(".cookie-overlay").count();
  console.log(".cookie-overlay count:", count);

  if (count > 0) {
    const html = await page.locator(".cookie-overlay").first().evaluate((el) => el.outerHTML);
    console.log("\n.cookie-overlay outerHTML:\n", html);

    const visible = await page.locator(".cookie-overlay").first().isVisible();
    console.log("Is visible:", visible);

    // List every button/anchor inside the overlay
    const btns = await page.locator(".cookie-overlay button, .cookie-overlay a").all();
    console.log("\nInteractive elements inside overlay:", btns.length);
    for (const b of btns) {
      const text = await b.innerText().catch(() => "");
      const cls  = await b.getAttribute("class").catch(() => "");
      const aria = await b.getAttribute("aria-label").catch(() => "");
      console.log("  tag=button/a  text:", JSON.stringify(text), "class:", cls, "aria-label:", aria);
    }
  }

  // Also check for a cookie banner elsewhere
  const genericBanner = await page.locator("[class*='cookie'], [class*='consent'], [id*='cookie']").all();
  console.log("\nAll cookie-related elements:", genericBanner.length);
  for (const el of genericBanner) {
    const tag  = await el.evaluate((e) => e.tagName);
    const cls  = await el.getAttribute("class").catch(() => "");
    const txt  = await el.innerText().catch(() => "").then((t) => t.slice(0, 120));
    console.log("  tag:", tag, "class:", cls, "text snippet:", JSON.stringify(txt));
  }

  await browser.close();
})().catch((err) => { console.error(err); process.exit(1); });
