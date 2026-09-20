# Price Tracker

## Project Overview
Price Tracker is a comprehensive web application designed to track products on an obfuscated e-commerce storefront. It allows users to monitor prices, stock availability, and receive automated email alerts when a product's price drops, increases, or comes back in stock.

## Key Features
- **Product tracking:** Add products using their store URLs.
- **Automated price scraping:** Scrapes heavily obfuscated DOM elements securely.
- **Price history:** Keeps a historic log of all scraped prices for each product.
- **Stock monitoring:** Tracks in-stock and out-of-stock statuses.
- **Email alerts:** Configurable global email alerting for price drops/increases and stock changes.
- **Manual "Scrape Now":** Force an immediate scrape for any tracked product.
- **Automated scheduled scraping:** Runs a centralized scraping pipeline to periodically update all products.
- **Search/filter functionality:** Easily search through tracked products on the dashboard.

## Architecture
- **Frontend:** React with Vite.
- **Backend:** Node.js with Express.
- **Scraping:** Playwright (for advanced DOM rendering, hydration, and bot-evasion resilience).
- **Database:** Supabase (PostgreSQL).
- **Email:** SendGrid.

## How Scraping Works
All scraping—whether triggered manually via the dashboard or automatically by the cron schedule—uses a highly resilient, centralized pipeline:

1. **Scraping:** Playwright navigates to the Product URL, waits for React hydration, safely clicks the "Reveal price" button, and extracts obfuscated DOM fragments.
2. **Parsing:** The extracted fragments are parsed to reconstruct the true numeric price and MRP.
3. **Comparison:** The newly scraped price and stock state are compared with the previous state from the database.
4. **Update:** The database price history and current state are updated.
5. **Alerts:** If the price changed (drop/increase) or the item came back in stock, an alert is dispatched via SendGrid to the globally configured alert email.

## Scraping Schedule
The application exposes a secure HTTP endpoint (`POST /api/cron/scrape`) designed to be triggered by an external scheduler (such as Render Cron or cron-job.org).

**Configured Schedule:** The intended scraping interval is **every 2 hours**.

The endpoint is protected by a Bearer token and implements concurrency locking to prevent overlapping scrape runs.

## Environment Variables

### Client (`client/.env`)
- `VITE_API_URL`: The URL of the backend API (e.g., `http://localhost:5000`)

### Server (`server/.env`)
- `PORT`: The port the backend runs on (e.g., `5000`)
- `SUPABASE_URL`: Your Supabase project URL (e.g., `https://your-project.supabase.co`)
- `SUPABASE_KEY`: Your Supabase anon or service key
- `CRON_SECRET`: A secure string used to authorize the external cron scheduler
- `TARGET_URL`: The target store URL base (e.g., `https://demo.inelabteamdev.com/`)
- `SENDGRID_API_KEY`: Your SendGrid API key for email alerts
- `ALERT_EMAIL_SENDER`: The verified sender email address for SendGrid (e.g., `sender@example.com`)

## Local Setup

1. **Clone repository:**
   ```bash
   git clone <repository-url>
   cd price-tracker-assignment
   ```
2. **Install client dependencies:**
   ```bash
   cd client
   npm install
   ```
3. **Install server dependencies:**
   ```bash
   cd ../server
   npm install
   ```
4. **Configure `.env` files:**
   Create `.env` in both the `client/` and `server/` directories using the variables documented above.
5. **Set up Supabase:**
   Create a new Supabase project and execute the SQL migrations found in `server/migrations/` in the Supabase SQL Editor.
6. **Start backend:**
   ```bash
   cd server
   npm run dev
   ```
7. **Start frontend:**
   ```bash
   cd client
   npm run dev
   ```
8. **Open application:**
   Navigate to the local URL provided by Vite (usually `http://localhost:5173`).

## Running Tests
To run the automated backend test suite, execute the following commands from the `server/` directory:
```bash
node test_alerts.js
node test_api.js
node test_db.js
node test_cron.js
node test_cron_alerts.js
node test_scraper_extraction.js
```

## Production / Cron Setup
In production (e.g., Render), the application is configured to run continuously.
To enable automated scraping:
1. Set up an external cron job (Render Cron, cron-job.org, etc.) to issue a `POST` request to `https://your-app.onrender.com/api/cron/scrape` every 2 hours.
2. Provide the authorization header: `Authorization: Bearer <YOUR_CRON_SECRET>`
3. The server immediately returns a `202 Accepted` response to prevent HTTP timeouts, and asynchronously processes all tracked products via the centralized scraping pipeline.

## Reliability Considerations
- **Isolated Browser Contexts:** Every scrape gets a completely fresh Playwright Context and Page to prevent state/cookie leakage.
- **Persistent Browser Reuse:** The Chromium instance is lazy-loaded and persisted across the server's lifecycle to avoid the heavy overhead of repeatedly launching the browser process.
- **Browser Crash Recovery:** Event listeners detect if the persistent browser disconnects or crashes, automatically healing the global instance on the next scrape request.
- **Concurrent Launch Protection:** Promises are used to ensure multiple simultaneous requests safely await a single browser launch instead of spawning redundant processes.
- **Fail-fast Behavior:** The scraper detects and fails fast on invalid products, and a single product failure does not crash or stop the cron run.
- **Centralized Pipeline:** Both manual and scheduled scrapes share identical extraction, error handling, and alerting logic.
