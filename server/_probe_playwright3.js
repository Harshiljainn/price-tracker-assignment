const { chromium } = require("playwright");

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  page.setDefaultTimeout(30000);
  await page.goto("https://demo.inelabteamdev.com/product/850", {
    waitUntil: "domcontentloaded",
  });
  const block = page.locator(".price-block").first();
  await block.waitFor({ state: "visible" });
  await block.scrollIntoViewIfNeeded();
  await block.hover();
  const box = await block.boundingBox();
  const y = box.y + box.height / 2;
  for (let i = 0; i < 16; i++) {
    await page.mouse.move(box.x + 20 + (i % 8) * 12, y + (i % 2) * 4, {
      steps: 3,
    });
    await page.waitForTimeout(60);
  }
  const btn = page.getByRole("button", { name: /reveal price/i });
  await btn.waitFor({ state: "visible" });
  console.log("disabled", await btn.isDisabled());
  await page.waitForFunction(
    () => {
      const b = document.querySelector('button[aria-label="Reveal price"]');
      return b && !b.disabled;
    },
    { timeout: 8000 }
  );
  await btn.click();
  await page.waitForSelector(
    ".price-block.price-success, .price-block.price-error, .stock-badge",
    { timeout: 25000 }
  );
  const className = await page.locator(".price-block").last().getAttribute("class");
  console.log("class", className);
  const html = await page.locator(".price-block").last().evaluate((el) => el.outerHTML);
  console.log(html);
  await browser.close();
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
