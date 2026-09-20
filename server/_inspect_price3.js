const fs = require("fs");
const s = fs.readFileSync("bundle.js", "utf8");
for (const n of ["minMoves", "minDwellMs", "function Fr", "function Br", "function zr", "phase===`ready`", "btn btn-primary"]) {
  const j = s.indexOf(n);
  console.log("\n====", n, j);
  if (j >= 0) console.log(s.slice(Math.max(0, j - 180), j + 280));
}
