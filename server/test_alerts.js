require('dotenv').config();
const assert = require('assert');

// 1. Mock SendGrid BEFORE requiring alerts
const sgMailPath = require.resolve('@sendgrid/mail');
require(sgMailPath); // populate cache
let mockSendCallCount = 0;
let lastMockMessage = null;
let mockShouldThrow = false;

require.cache[sgMailPath].exports = {
  setApiKey: (key) => { /* mock */ },
  send: async (msg) => {
    if (mockShouldThrow) {
      throw new Error('Mock SendGrid Error');
    }
    mockSendCallCount++;
    lastMockMessage = msg;
    return [{ statusCode: 202 }];
  }
};

const alerts = require('./alerts');

async function runTests() {
  console.log("==========================================");
  console.log("  Testing Alerts Module (Mocked SendGrid)");
  console.log("==========================================");

  let passed = 0;
  let failed = 0;

  async function test(label, fn) {
    try {
      await fn();
      console.log(`✅ ${label}`);
      passed++;
    } catch (err) {
      console.error(`❌ ${label}`);
      console.error("   ", err.message);
      failed++;
    }
  }

  // Preserve original env vars
  const origKey = process.env.SENDGRID_API_KEY;
  const origSender = process.env.ALERT_EMAIL_SENDER;

  // Set test env vars — no ALERT_EMAIL_RECIPIENT needed
  process.env.SENDGRID_API_KEY = 'test-key';
  process.env.ALERT_EMAIL_SENDER = 'sender@test.com';

  try {
    await test("7. Indian currency formatting works correctly", async () => {
      assert.strictEqual(alerts.formatCurrency(1500.50), "₹1,501");
      assert.strictEqual(alerts.formatCurrency(10000), "₹10,000");
    });

    await test("4. Missing SendGrid API key does not crash", async () => {
      process.env.SENDGRID_API_KEY = '';
      const res = await alerts.sendPriceChangeAlert({
        recipient: 'user@test.com',
        productName: 'Test Product',
        productUrl: 'http://test.com',
        oldPrice: 100,
        newPrice: 80
      });
      assert.strictEqual(res.success, false);
      assert.strictEqual(res.skipped, true);
      process.env.SENDGRID_API_KEY = 'test-key'; // restore
    });

    await test("4b. Missing recipient email does not crash", async () => {
      const res = await alerts.sendPriceChangeAlert({
        recipient: null,
        productName: 'Test Product',
        productUrl: 'http://test.com',
        oldPrice: 100,
        newPrice: 80
      });
      assert.strictEqual(res.success, false);
      assert.strictEqual(res.skipped, true);
    });

    await test("4c. Invalid recipient email does not crash", async () => {
      const res = await alerts.sendPriceChangeAlert({
        recipient: 'not-a-valid-email',
        productName: 'Test Product',
        productUrl: 'http://test.com',
        oldPrice: 100,
        newPrice: 80
      });
      assert.strictEqual(res.success, false);
      assert.strictEqual(res.skipped, true);
    });

    await test("5. SendGrid failure does not crash", async () => {
      mockShouldThrow = true;
      const res = await alerts.sendPriceChangeAlert({
        recipient: 'user@test.com',
        productName: 'Test Product',
        productUrl: 'http://test.com',
        oldPrice: 100,
        newPrice: 80
      });
      assert.strictEqual(res.success, false);
      assert.strictEqual(res.skipped, true);
      mockShouldThrow = false; // restore
    });

    await test("10. No ALERT_EMAIL_RECIPIENT env var needed (only API Key + Sender)", async () => {
      // ALERT_EMAIL_RECIPIENT is not set — should still work with explicit recipient param
      delete process.env.ALERT_EMAIL_RECIPIENT;
      mockSendCallCount = 0;

      const res = await alerts.sendPriceChangeAlert({
        recipient: 'explicit@recipient.com',
        productName: 'Test Product',
        productUrl: 'http://test.com',
        oldPrice: 100,
        newPrice: 80
      });
      assert.strictEqual(res.success, true);
      assert.strictEqual(mockSendCallCount, 1);
      assert.strictEqual(lastMockMessage.to, 'explicit@recipient.com');
    });

    await test("1. Price-drop email builds correctly & 3. Expected sender/recipient & 6. Correct data", async () => {
      mockSendCallCount = 0;
      lastMockMessage = null;

      const res = await alerts.sendPriceChangeAlert({
        recipient: 'user@test.com',
        productName: 'Vantablack Earbuds Pro',
        productUrl: 'https://test.com/v-buds',
        oldPrice: 10000,
        newPrice: 8500
      });

      assert.strictEqual(res.success, true);
      assert.strictEqual(mockSendCallCount, 1);
      
      assert.strictEqual(lastMockMessage.to, 'user@test.com');
      assert.strictEqual(lastMockMessage.from, 'sender@test.com');
      assert.strictEqual(lastMockMessage.subject, 'Price Drop Alert: Vantablack Earbuds Pro');

      // Verify email body contains the expected text
      const body = lastMockMessage.text;
      assert.ok(body.includes('Vantablack Earbuds Pro'));
      assert.ok(body.includes('₹10,000'));
      assert.ok(body.includes('₹8,500'));
      assert.ok(body.includes('₹1,500')); // Savings
      assert.ok(body.includes('15%'));    // Drop percentage
      assert.ok(body.includes('https://test.com/v-buds'));
    });

    await test("2. Back-in-stock email builds correctly", async () => {
      mockSendCallCount = 0;
      lastMockMessage = null;

      const res = await alerts.sendBackInStockAlert({
        recipient: 'user@test.com',
        productName: 'Vantablack Earbuds Pro',
        productUrl: 'https://test.com/v-buds',
        price: 8500
      });

      assert.strictEqual(res.success, true);
      assert.strictEqual(mockSendCallCount, 1);
      
      assert.strictEqual(lastMockMessage.to, 'user@test.com');
      assert.strictEqual(lastMockMessage.from, 'sender@test.com');
      assert.strictEqual(lastMockMessage.subject, 'Back in Stock Alert: Vantablack Earbuds Pro');

      const body = lastMockMessage.text;
      assert.ok(body.includes('available again'));
      assert.ok(body.includes('₹8,500'));
      assert.ok(body.includes('https://test.com/v-buds'));
    });

  } finally {
    // Restore orig env vars
    process.env.SENDGRID_API_KEY = origKey || '';
    process.env.ALERT_EMAIL_SENDER = origSender || '';

    console.log("\n==========================================");
    if (failed === 0) {
      console.log(`✅ All ${passed} alerts tests passed!`);
    } else {
      console.log(`❌ ${failed} test(s) failed, ${passed} passed.`);
    }
    console.log("==========================================\n");
    process.exit(failed > 0 ? 1 : 0);
  }
}

runTests();
