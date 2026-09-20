const fs = require("fs");
const s = fs.readFileSync("bundle.js", "utf8");
const i = s.lastIndexOf("Rr=[", 275228);
console.log("i", i);
console.log(s.slice(i, i + 500));
const j = s.indexOf("y=(0,N.jsx)(v,{className:`${d.rot}");
console.log("\n==== price value jsx");
console.log(s.slice(j, j + 900));
