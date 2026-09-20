const fs = require("fs");
const s = fs.readFileSync("bundle.js", "utf8");

const urls = [...s.matchAll(/https?:\/\/[^"'\\\s)]+/g)].map((m) => m[0]);
console.log("URLS");
console.log([...new Set(urls)].slice(0, 80).join("\n"));

const paths = [...s.matchAll(/["'`](\/[a-zA-Z0-9_\-/.]+)["'`]/g)]
  .map((m) => m[1])
  .filter((x) => /product|api|catalog|price|stock|item|sku/i.test(x));
console.log("\nPATHS");
console.log([...new Set(paths)].slice(0, 120).join("\n"));

for (const needle of [
  "stock",
  "price",
  "sku",
  "products.json",
  "/products",
  "inelab",
  "data-product",
  "in_stock",
  "out of stock",
]) {
  const i = s.toLowerCase().indexOf(needle.toLowerCase());
  console.log("\nNEEDLE", needle, i);
  if (i >= 0) console.log(s.slice(Math.max(0, i - 80), i + 160));
}
