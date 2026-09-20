const { chromium } = require("playwright");

const url = "https://demo.inelabteamdev.com/product/854";

async function runStrategy(strategyName, useSamePage) {
  console.log(`\n=== Testing Strategy: ${strategyName} ===`);
  const browser = await chromium.launch({ headless: true });
  
  let context = null;
  let page = null;
  
  for (let attempt = 1; attempt <= 3; attempt++) {
    const t0 = Date.now();
    let setupTime = 0;
    
    if (!useSamePage || !page) {
      if (context) await context.close();
      const tContext = Date.now();
      context = await browser.newContext({
        userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
      });
      page = await context.newPage();
      setupTime = Date.now() - tContext;
    }

    const tNav = Date.now();
    await page.goto(url, { waitUntil: "domcontentloaded" });
    const navTime = Date.now() - tNav;

    // Cookie dismissal
    await page.evaluate(() => {
      document.querySelectorAll(".cookie-overlay").forEach((el) => el.remove());
    });

    const block = page.locator(".price-block").first();
    await block.waitFor({ state: "visible" });

    await block.scrollIntoViewIfNeeded();
    await block.hover();
    
    const box = await block.boundingBox();
    const centerY = box.y + box.height / 2;
    const btn = page.getByRole("button", { name: /reveal price/i });

    let wiggleStep = 0;
    while (true) {
      await page.mouse.move(box.x + 20 + (wiggleStep % 8) * 12, centerY + (wiggleStep % 2) * 4, { steps: 2 });
      wiggleStep++;
      if (await btn.isVisible().catch(()=>false) && !(await btn.isDisabled().catch(()=>true))) {
        break;
      }
      await page.waitForTimeout(30);
    }
    
    const tBtn = Date.now();
    
    // Track network request
    let requestSent = false;
    const reqListener = (req) => {
        if (req.url().includes("/api/challenge") || req.url().includes("/api/products/")) {
            requestSent = true;
        }
    };
    page.on("request", reqListener);

    await btn.click({ force: true });
    
    // Check if network request sent within 1000ms
    await page.waitForTimeout(1000);
    const networkActive = requestSent;
    page.off("request", reqListener);

    try {
        await page.waitForSelector(".price-block.price-success, .price-block.price-error, .stock-badge", { timeout: 7000 });
        const totalTime = Date.now() - t0;
        console.log(`[Attempt ${attempt}] SUCCESS | Setup: ${setupTime}ms | Nav: ${navTime}ms | Total: ${totalTime}ms`);
        break; // Success!
    } catch (e) {
        const totalTime = Date.now() - t0;
        console.log(`[Attempt ${attempt}] TIMEOUT | Setup: ${setupTime}ms | Nav: ${navTime}ms | Total: ${totalTime}ms | Network sent: ${networkActive}`);
    }
  }
  
  await browser.close();
}

async function main() {
    await runStrategy("Fresh Page Per Attempt", false);
    await runStrategy("Same Page Reuse", true);
}

main().catch(console.error);
