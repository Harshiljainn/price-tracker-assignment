const { chromium } = require("playwright");

async function probeReveal() {
  const url = "https://demo.inelabteamdev.com/product/854"; // known slow product
  console.log(`Probing network/DOM for: ${url}`);
  
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  });
  
  const page = await context.newPage();
  
  // Listen for all network events
  page.on("request", request => {
    if (request.url().includes("inelabteamdev") && request.resourceType() === "fetch" || request.resourceType() === "xhr") {
      console.log(`[NETWORK REQUEST] ${request.method()} ${request.url()}`);
    }
  });
  
  page.on("response", async response => {
    if (response.url().includes("inelabteamdev") && response.request().resourceType() === "fetch" || response.request().resourceType() === "xhr") {
      const status = response.status();
      console.log(`[NETWORK RESPONSE] ${status} ${response.url()}`);
      if (status !== 200) {
        try {
            console.log(`[NETWORK RESPONSE TEXT] ${await response.text()}`);
        } catch (e) {}
      }
    }
  });

  await page.goto(url, { waitUntil: "domcontentloaded" });
  console.log("DOM loaded.");

  // Remove cookie overlay
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

  console.log("Hovering to enable button...");
  let wiggleStep = 0;
  while (true) {
    await page.mouse.move(box.x + 20 + (wiggleStep % 8) * 12, centerY + (wiggleStep % 2) * 4, { steps: 2 });
    wiggleStep++;
    if (await btn.isVisible().catch(()=>false) && !(await btn.isDisabled().catch(()=>true))) {
      break;
    }
    await page.waitForTimeout(30);
  }
  
  console.log("Button enabled. Clicking...");
  await btn.click({ force: true });
  
  console.log("Waiting up to 10s to see what happens on network and DOM...");
  
  // Monitor DOM mutations on the price block
  await page.evaluate(() => {
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
              window._mutationLogs.push(args[0]);
          }
          origConsoleLog.apply(console, args);
      }
  });

  try {
      await page.waitForTimeout(10000);
  } catch (e) {}
  
  const mutationLogs = await page.evaluate(() => window._mutationLogs);
  mutationLogs.forEach(log => console.log(log));
  
  await browser.close();
}

probeReveal().catch(console.error);
