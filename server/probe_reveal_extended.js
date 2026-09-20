const { chromium } = require("playwright");

async function probeReveal() {
  const url = "https://demo.inelabteamdev.com/product/854"; 
  console.log(`Probing network/DOM for: ${url}`);
  
  const browser = await chromium.launch({ headless: true });

  for (let i = 1; i <= 3; i++) {
    console.log(`\n=== ATTEMPT ${i} ===`);
    const context = await browser.newContext({
      userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    });
    
    const page = await context.newPage();
    const t0 = Date.now();
    
    // Listen for all network events
    page.on("request", request => {
      if (request.url().includes("inelabteamdev") && (request.resourceType() === "fetch" || request.resourceType() === "xhr")) {
        console.log(`[+${Date.now() - t0}ms] [REQ] ${request.method()} ${request.url()}`);
      }
    });
    
    page.on("response", async response => {
      if (response.url().includes("inelabteamdev") && (response.request().resourceType() === "fetch" || response.request().resourceType() === "xhr")) {
        const status = response.status();
        console.log(`[+${Date.now() - t0}ms] [RES] ${status} ${response.url()}`);
        if (status !== 200) {
          try {
              console.log(`[+${Date.now() - t0}ms] [BODY] ${await response.text()}`);
          } catch (e) {}
        }
      }
    });

    await page.goto(url, { waitUntil: "domcontentloaded" });
    
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
    
    console.log(`[+${Date.now() - t0}ms] Button enabled. Clicking...`);
    await btn.click({ force: true });
    
    // Monitor DOM mutations on the price block
    await page.evaluate(() => {
        window._t0 = Date.now();
        const block = document.querySelector(".price-block");
        const observer = new MutationObserver((mutations) => {
            mutations.forEach(mutation => {
                if (mutation.type === "attributes" && mutation.attributeName === "class") {
                    console.log(`[DOM MUTATION] .price-block classes: ${mutation.target.className}`);
                }
            });
        });
        observer.observe(block, { attributes: true });
        window._mutationLogs = [];
        
        const origConsoleLog = console.log;
        console.log = function(...args) {
            if (typeof args[0] === 'string' && args[0].startsWith('[DOM MUTATION]')) {
                window._mutationLogs.push(`[+${Date.now() - window._t0}ms] ${args[0]}`);
            }
            origConsoleLog.apply(console, args);
        }
    });

    try {
        await page.waitForSelector(".price-block.price-success, .price-block.price-error, .stock-badge", { timeout: 8000 });
        console.log(`[+${Date.now() - t0}ms] Reveal Success!`);
    } catch (e) {
        console.log(`[+${Date.now() - t0}ms] Reveal TIMEOUT!`);
    }
    
    const mutationLogs = await page.evaluate(() => window._mutationLogs);
    mutationLogs.forEach(log => console.log(log));
    
    await context.close();
  }
  
  await browser.close();
}

probeReveal().catch(console.error);
