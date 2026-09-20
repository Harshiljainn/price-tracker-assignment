const fs = require("fs");
const s = fs.readFileSync("bundle.js", "utf8");
const i = s.indexOf("async function Dr(e,t)");
console.log(s.slice(i, i + 1800));
console.log("\n\n==== hover / reveal ====");
for (const n of ["Reveal price", "price-idle", "mouseenter", "pointerenter", "hover"]) {
  const j = s.indexOf(n);
  console.log("\n", n, j);
  if (j >= 0) console.log(s.slice(Math.max(0, j - 200), j + 250));
}
