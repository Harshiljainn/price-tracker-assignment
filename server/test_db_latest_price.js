require("dotenv").config();
const { createClient } = require("@supabase/supabase-js");
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

async function run() {
  const { data, error } = await supabase
    .from("products")
    .select(`
      *,
      price_history (
        price,
        mrp,
        in_stock
      )
    `)
    .eq("is_tracked", true)
    .order("scraped_at", { foreignTable: "price_history", ascending: false })
    .limit(1, { foreignTable: "price_history" });
    
  console.log("Error:", error);
  console.log("Data:", JSON.stringify(data, null, 2));
}

run().catch(console.error);
