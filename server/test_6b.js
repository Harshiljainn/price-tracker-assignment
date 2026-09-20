require('dotenv').config();
const db = require('./db');
const http = require('http');

async function testResolution() {
  console.log('--- 1. Testing db.resolveSku ---');
  try {
    const url1 = await db.resolveSku('HEL-10018');
    console.log('HEL-10018 ->', url1);
    
    const url2 = await db.resolveSku('SKU DOM-10851');
    console.log('SKU DOM-10851 ->', url2);
    
    try {
      await db.resolveSku('INVALID-999999');
      console.log('❌ Failed: Should have thrown for invalid product');
    } catch (e) {
      console.log('✅ Correctly threw on invalid SKU:', e.message);
    }
  } catch (e) {
    console.error('Resolution tests failed:', e);
  }
}

async function request(options, postData) {
  return new Promise((resolve, reject) => {
    const req = http.request(options, res => {
      let data = '';
      res.on('data', d => data += d);
      res.on('end', () => resolve({ statusCode: res.statusCode, data: JSON.parse(data) }));
    });
    req.on('error', reject);
    if (postData) req.write(JSON.stringify(postData));
    req.end();
  });
}

async function testApi() {
  console.log('\n--- 2. Testing API (Start server manually or in parallel) ---');
  // Assume server is running on port 5000
  const port = process.env.PORT || 5000;
  
  try {
    // A. URL tracking
    console.log('Testing Tracking via URL...');
    let res = await request({
      hostname: 'localhost', port, path: '/api/products', method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, { url: 'https://demo.inelabteamdev.com/product/10' });
    console.log('POST URL ->', res.statusCode, res.data.id);
    let pId1 = res.data.id;

    // B. SKU tracking
    console.log('Testing Tracking via SKU...');
    res = await request({
      hostname: 'localhost', port, path: '/api/products', method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, { url: 'SKU COP-10853' });
    console.log('POST SKU ->', res.statusCode, res.data.id, 'URL:', res.data.url);
    let pId2 = res.data.id;

    // C. Auto Scrape Simulation (Testing scrape endpoint directly)
    console.log('Testing Scrape Endpoint (Extracts quantity)...');
    res = await request({
      hostname: 'localhost', port, path: `/api/products/${pId2}/scrape`, method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    });
    console.log('SCRAPE ->', res.statusCode, 'Quantity:', res.data.quantity);
    
    // D. Duplicate Tracking (API layer duplicate creation)
    console.log('Testing Duplicate Tracking...');
    res = await request({
      hostname: 'localhost', port, path: '/api/products', method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, { url: 'SKU COP-10853' });
    console.log('POST Duplicate SKU ->', res.statusCode, res.data.error || 'No error?!');

    // Cleanup
    await db.deleteTrackedProduct(pId1);
    await db.deleteTrackedProduct(pId2);
    console.log('Cleanup done.');
  } catch(e) {
    console.error('API Tests failed:', e.message);
  }
}

async function run() {
  await testResolution();
  await testApi();
  process.exit(0);
}
run();
