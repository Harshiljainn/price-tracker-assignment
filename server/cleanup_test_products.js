require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

// All confirmed test-only product IDs (URLs contain "test-" marker)
const TEST_IDS = [
  "3b64523d-9ef7-4e1d-9cbf-609870e297b2",
  "c546cb2a-5b31-455c-81b3-a96eabdf6029",
  "54d7bc2b-31fd-4a89-a4d3-e7f1857fc7c2",
  "dc0559c9-b5ad-4a96-b282-c2d8d83084e3",
  "0b73d1d2-8cc3-477f-8c08-479707f20173"
];

async function run() {
  console.log(`Deleting ${TEST_IDS.length} test products...`);
  
  for (const id of TEST_IDS) {
    const { error } = await sb.from('products').delete().eq('id', id);
    if (error) {
      console.error(`  FAILED to delete ${id}: ${error.message}`);
    } else {
      console.log(`  Deleted ${id}`);
    }
  }

  // Verify
  const { data, error } = await sb.from('products').select('id, name, url');
  if (error) {
    console.error('Verification failed:', error.message);
    return;
  }
  console.log('\nRemaining products:');
  console.log(JSON.stringify(data, null, 2));
}

run().catch(console.error);
