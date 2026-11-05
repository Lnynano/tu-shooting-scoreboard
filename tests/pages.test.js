// Run: node tests/pages.test.js
// Script order guard: render.js uses Scoring and Finals at call time, so every page that loads render.js must
// load scoring.js and finals.js before it. A missing <script> only breaks that one page, so check them all.
const fs = require("fs");
const path = require("path");
const assert = require("assert");

const root = path.join(__dirname, "..");
const pages = fs.readdirSync(root).filter((f) => f.endsWith(".html"));
let checked = 0;
for (const f of pages) {
  const html = fs.readFileSync(path.join(root, f), "utf8");
  const pos = (src) => html.indexOf(`<script src="${src}"></script>`);
  if (pos("js/render.js") < 0) continue;
  assert.ok(pos("js/scoring.js") >= 0 && pos("js/scoring.js") < pos("js/finals.js"), `${f}: scoring.js must load before finals.js`);
  assert.ok(pos("js/finals.js") >= 0 && pos("js/finals.js") < pos("js/render.js"), `${f}: finals.js must load before render.js`);
  checked++;
}
assert.ok(checked >= 6, "expected at least 6 pages that use render.js, found " + checked);
console.log(`OK — script order checked in ${checked} pages (scoring.js, finals.js, render.js)`);
