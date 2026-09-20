# Price Tracker — Design Note

## 1. Design Overview
The Price Tracker application is built around a centralized service architecture separating scraping, persistence, and alerts. This separation of concerns ensures that the core application remains modular.

The `scrapeService` acts as the orchestrator: it consumes a tracked product URL, offloads the raw web interaction to the isolated Playwright `scraper.js`, compares the parsed result against the database state in Supabase, and triggers email notifications via SendGrid if thresholds (price changes or stock availability) are met. This design guarantees that data extraction is decoupled from business logic and database persistence.

## 2. Scraping Reliability
To ensure highly reliable scraping against an obfuscated React SPA:
- **Playwright Execution:** Used over simple HTTP fetching to allow full React DOM rendering, hydration, and Javascript execution.
- **Isolated Contexts:** Each scrape generates a completely fresh browser context and page to prevent cross-contamination of state, cookies, or cache, minimizing bot-detection risk.
- **Persistent Global Browser:** The core Chromium instance is kept alive and reused across requests.
- **Crash Recovery:** Event listeners explicitly detect if the global browser disconnects or crashes, guaranteeing it automatically recovers on the subsequent scrape.
- **Concurrency Guards:** A `browserLaunching` promise lock prevents a race condition where concurrent API requests might spawn redundant browser processes.
- **Resilient Extraction:** The DOM parser reconstructs the price dynamically from multiple child `<span>` elements and strips zero-width obfuscation characters, bypassing the store's fragile CSS classes.
- **Actionable UI Interaction:** The "Reveal price" button is clicked utilizing Playwright's native actionability checks rather than forced synthetic clicks, perfectly synchronizing with the store's React event listeners.

## 3. Performance Trade-offs
A fundamental trade-off was made regarding browser persistence:
- **Persistent Browser:** Spinning up a full Chromium process for every scrape attempt is CPU-intensive and severely impacts application latency. By reusing a persistent global browser, scrape latency dropped significantly, providing a snappy experience for manual "Scrape Now" actions and reducing compute overhead during cron runs.
- **Fresh Context per Scrape:** While reusing the browser process, we deliberately create a fresh context and page for every scrape. Though creating a context takes ~50-100ms, it is a necessary trade-off to ensure anti-bot safety and prevent state leakage, providing isolation comparable to a fresh browser without the heavy startup cost.

## 4. Alert Architecture
Manual "Scrape Now" requests and automated Cron jobs operate fundamentally differently at the trigger level, but they ultimately resolve to the exact same centralized pipeline.
By consolidating this logic into a unified `scrapeService`:
1. Scrape the product.
2. Compare the previous and new states.
3. Update the database.
4. Dispatch the alert.

This avoids drift between manual and scheduled scrape behaviors, ensuring the user reliably receives identical price drops or stock alerts regardless of how the scrape was initiated.

## 5. What Went Wrong in the First AI-Assisted Attempt
During initial development, several challenges were encountered and subsequently resolved:

1. **Obfuscated Price DOM:** The first extraction logic failed because the store obfuscated the price by splitting it across multiple `<span>` tags, inserting zero-width spaces, and using random CSS classes. This was fixed by writing a resilient extraction parser that iterates through all child spans matching the `pv-` prefix and concatenates the text cleanly.
2. **Silent Button Clicks:** The scraper initially used `await btn.click({ force: true });` to bypass actionability checks. This caused the synthetic click to dispatch before the store's React frontend had fully hydrated its event listeners, causing the click to be completely ignored. This was corrected by reverting to `await btn.click();`, which waits for natural DOM stability and React readiness.
3. **Severe Scraping Latency:** Because the initial reveal click failed silently, the scraper hit an 8-second timeout, waited for a retry, re-navigated, and re-hovered, ballooning the scrape time to 15–30 seconds. Fixing the click event (above) reduced the scrape time to a consistent 1.5–4 seconds on the very first attempt.
4. **Search Race Condition:** The frontend search UI experienced a loading-state race condition. If the user rapidly cleared the search input during the debounce period, the "Loading products" spinner remained stuck indefinitely. This was fixed in `Dashboard.jsx`.
5. **Debug Artifacts:** Various temporary investigation and diagnostic scripts were left in the repository. These debug artifacts were thoroughly wiped, and the `.gitignore` was hardened to prevent accidental commits.

## 6. Known Trade-offs / Limitations
- **Storefront Dependency:** The scraper is inherently coupled to the target store's DOM structure. Radical changes to their markup or anti-bot mechanisms could break extraction.
- **Sequential Scraping:** The cron job currently processes products sequentially to minimize compute spikes and bot detection. As the number of tracked products grows significantly, the overall cron execution time will increase.
- **Delivery Dependability:** Email alerts rely on the availability and configuration of the third-party provider (SendGrid).
- **External Scheduling:** The application relies on an external scheduler (like Render Cron) to trigger the endpoint every 2 hours, rather than hosting its own long-running in-memory Node scheduler.
