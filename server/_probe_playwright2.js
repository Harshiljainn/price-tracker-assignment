const { chromium } = require("playwright");

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  page.setDefaultTimeout(25000);
  await page.goto("https://demo.inelabteamdev.com/product/850", {
    waitUntil: "domcontentloaded",
  });
  const block = page.locator(".price-block").first();
  await block.waitFor({ state: "visible" });
  const box = await block.boundingBox();
  await page.mouse.move(box.x + 12, box.y + 12);
  for (let i = 0; i < 14; i++) {
    await page.mouse.move(box.x + 12 + i * 10, box.y + 10 + (i % 4) * 8, {
      steps: 2,
    });
    await page.waitForTimeout(50);
  }
  await page.waitForTimeout(700);
  const btn = page.getByRole("button", { name: /reveal price/i });
  await btn.click({ timeout: 5000 });
  await page.getByText(/IN STOCK|Out of stock/i).waitFor({ timeout: 20000 });
  await page.waitForTimeout(500);
  const count = await page.locator(".price-block").count();
  console.log("price-block count", count);
  const html = await page.locator(".price-block").last().innerHTML();
  console.log("HTML\n", html);
  const visiblePrices = await page.evaluate(() => {
    const nodes = [...document.querySelectorAll(".price-block *")];
    return nodes
      .filter((el) => {
        const st = getComputedStyle(el);
        if (st.display === "none" || st.visibility === "hidden") return false;
        if (el.getAttribute("aria-hidden") === "true") return false;
        return /₹|INR|\d/.test(el.textContent || "");
      })
      .map((el) => ({
        tag: el.tagName,
        class: el.className,
        aria: el.getAttribute("aria-hidden"),
        deco: el.style.textDecoration,
        text: el.textContent,
      }));
  });
  console.log(JSON.stringify(visiblePrices, null, 2));
  await browser.close();
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
