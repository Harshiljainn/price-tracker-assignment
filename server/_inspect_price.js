const fs = require("fs");
const s = fs.readFileSync("bundle.js", "utf8");
const i = s.indexOf("return{shown:s.p,mrp:s.m");
console.log(s.slice(i - 2500, i + 800));
