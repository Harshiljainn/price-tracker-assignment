const fs = require("fs");
const s = fs.readFileSync("bundle.js", "utf8");
let from = 0, n = 0;
while (n < 8) {
  const i = s.indexOf("minMoves", from);
  if (i < 0) break;
  console.log("\n====", i);
  console.log(s.slice(i - 100, i + 200));
  from = i + 8;
  n++;
}
const i2 = s.indexOf("children:zr(");
console.log("\n==== zr call");
console.log(s.slice(i2 - 50, i2 + 80));
const i3 = s.indexOf("stock>0");
console.log(s.slice(i3 - 80, i3 + 200));

// stock formatter near Fr
const i4 = s.indexOf("function zr(");
console.log("\n==== all zr");
from = 0;
for (let k = 0; k < 5; k++) {
  const i = s.indexOf("zr=e", from);
  const j = s.indexOf("function zr", from);
  console.log(i, j);
  from = Math.min(i > 0 ? i : 1e12, j > 0 ? j : 1e12) + 1;
  if (from > 1e12) break;
}

const i5 = s.indexOf(",zr=");
console.log("comma zr", i5);
if (i5>0) console.log(s.slice(i5-20, i5+200));
