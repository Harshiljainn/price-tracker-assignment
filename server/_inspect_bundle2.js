const fs = require("fs");
const s = fs.readFileSync("bundle.js", "utf8");

const needles = [
  "/api/",
  "api/layout",
  "fetch(",
  "catalog",
  "to(\"/p",
  "navigate",
  "/p/",
  "product/",
  "sku",
  "priceTag",
  "stock-badge",
  "in-stock",
  "out-stock",
  "sale",
  "mrp",
];

for (const needle of needles) {
  let from = 0;
  let n = 0;
  console.log("\n========", needle);
  while (n < 3) {
    const i = s.indexOf(needle, from);
    if (i < 0) break;
    console.log("---", i);
    console.log(s.slice(Math.max(0, i - 120), i + 220));
    from = i + needle.length;
    n++;
  }
}
