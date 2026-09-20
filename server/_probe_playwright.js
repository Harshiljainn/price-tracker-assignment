const { chromium } = require("playwright");

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  page.setDefaultTimeout(20000);
  await page.goto("https://demo.inelabteamdev.com/product/850", {
    waitUntil: "domcontentloaded",
  });
  const block = page.locator(".price-block");
  await block.waitFor({ state: "visible" });
  const box = await block.boundingBox();
  console.log("box", box);
  await page.mouse.move(box.x + 10, box.y + 10);
  for (let i = 0; i < 12; i++) {
    await page.mouse.move(
      box.x + 10 + i * 8,
      box.y + 8 + (i % 3) * 6,
      { steps: 2 }
    );
    await page.waitForTimeout(50);
  }
  await page.waitForTimeout(700);
  const btn = page.getByRole("button", { name: /reveal price/i });
  console.log("disabled", await btn.isDisabled());
  if (await btn.isDisabled()) {
    console.log("substatus", await page.locator(".price-substatus").innerText().catch(() => ""));
  } else {
    await btn.click();
  }
  await page.waitForTimeout(3000);
  const html = await page.locator(".price-block").innerHTML().catch(() => "missing");
  const text = await page.locator(".price-block").innerText().catch(() => "missing");
  console.log("TEXT\n", text);
  console.log("HTML\n", html.slice(0, 3000));
  await browser.close();
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
