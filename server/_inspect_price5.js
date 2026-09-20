const fs = require("fs");
const s = fs.readFileSync("bundle.js", "utf8");
console.log(s.slice(275200, 275450));
console.log("\n==== after reveal phases");
const i = s.indexOf("n.phase===`loading`");
console.log(s.slice(i, i + 2200));
