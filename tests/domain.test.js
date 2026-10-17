// Run: node tests/domain.test.js
// The custom domain lives in two places that must agree: the CNAME file and the absolute URLs in the share tags.
const fs = require("fs");
const path = require("path");
const assert = require("assert");
const root = path.join(__dirname, "..");

const cname = fs.readFileSync(path.join(root, "CNAME"), "utf8").trim();
assert.ok(/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(cname) && !/\s/.test(cname), "CNAME holds exactly one host name, got: " + JSON.stringify(cname));

for (const page of ["index.html", "board.html", "results.html"]) {
  const html = fs.readFileSync(path.join(root, page), "utf8");
  for (const tag of ['property="og:url"', 'property="og:image"', 'name="twitter:image"']) {
    const m = new RegExp(`<meta ${tag} content="([^"]+)"`).exec(html);
    assert.ok(m, `${page}: missing ${tag}`);
    assert.ok(m[1].startsWith(`https://${cname}/`), `${page}: ${tag} is ${m[1]}, expected https://${cname}/...`);
  }
}

// no page may hard-code the old github.io address or a /repo-name/ path (assets must stay relative so the site works at the domain root)
for (const f of fs.readdirSync(root).filter((n) => n.endsWith(".html"))) {
  const html = fs.readFileSync(path.join(root, f), "utf8");
  assert.ok(!/github\.io/.test(html), `${f}: still mentions github.io`);
  assert.ok(!/(?:src|href)="\/(?!\/)/.test(html), `${f}: has a root-absolute src/href`);
}
console.log(`OK — CNAME (${cname}) matches the share tags in 3 pages; no github.io or root-absolute paths`);
