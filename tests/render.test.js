// Run: node tests/render.test.js
// render.js builds HTML strings from user-entered text (names, teams, relay, lane, competition names).
// Check that hostile text is escaped in every place it is used, in the board table and the athlete detail card.
const assert = require("assert");
global.window = global;
global.location = { search: "" };
global.I18n = { L: (th) => th };
global.Scoring = require("../js/scoring.js");
require("../js/render.js");
const R = global.Render;

const EVIL = [
  '<img src=x onerror=alert(1)>',
  '"><script>alert(1)</script>',
  "' onmouseover='alert(1)",
  '" onfocus="alert(1)" autofocus="',
  "</td><td>injected</td>",
  "&lt;already&gt; & done"
];

function mk(i, evil) {
  return { id: `a${i}"><b>`, name: evil, uni: evil, cat: "W", relay: evil, lane: evil, shots: [], ser: ["91-2x", "90-1x", "", "", "", ""] };
}
// no raw tag / attribute breakout survives
function assertSafe(html, label) {
  assert.ok(!/<img\b/i.test(html), label + ": raw <img> present");
  assert.ok(!/<script\b/i.test(html), label + ": raw <script> present");
  assert.ok(!/<b>/i.test(html), label + ": raw <b> from an id present");
  assert.ok(!/<td>injected/i.test(html), label + ": injected cell present");
  // an unescaped double quote would let text start a new attribute: look for  " onxxx=
  assert.ok(!/"\s+on\w+\s*=/i.test(html), label + ': attribute breakout ("  onxxx=) present');
  assert.ok(!/'\s*onmouseover\s*=\s*'alert/i.test(html.replace(/&#39;/g, "")) || !/<[^>]*\sonmouseover=/i.test(html), label + ": onmouseover attribute created");
}

// esc itself
assert.strictEqual(R.esc('<a href="x">&</a>'), "&lt;a href=&quot;x&quot;&gt;&amp;&lt;/a&gt;");
assert.strictEqual(R.esc(null), "");
assert.strictEqual(R.esc(0), "0");

let checks = 0;
for (const evil of EVIL) {
  const athletes = [mk(1, evil), mk(2, "Clean Name")];
  athletes[1].uni = evil;                       // same (hostile) team so a team row exists
  for (let tab = 0; tab < 4; tab++) {
    const h = R.boardHTML({ athletes, event: "ap60", teamSize: 3, tab, clickable: true, selectedId: athletes[0].id, nowRelay: evil });
    assertSafe(h.thead + h.tbody + h.title + h.info, `boardHTML tab ${tab} / ${evil.slice(0, 18)}`);
    checks++;
  }
  assertSafe(R.detailHTML(athletes[0], athletes, "ap60"), "detailHTML / " + evil.slice(0, 18));
  checks++;
}

// the hostile text is still visible to the user, just inert
const h = R.boardHTML({ athletes: [mk(1, EVIL[0])], event: "ap60", teamSize: 3, tab: 0 });
assert.ok(h.tbody.includes("&lt;img src=x onerror=alert(1)&gt;"), "text shown escaped");

// competition name never reaches innerHTML unescaped through subline/nowText either (they are used with textContent,
// but make sure the helpers do not add markup)
assert.ok(!/[<>]/.test(R.subline({ name: "Plain", event: "ap60" })));
assert.strictEqual(R.nowText({ current_relay: "2" }).includes("2"), true);
assert.strictEqual(R.nowText({ current_relay: "" }), "");
assert.strictEqual(R.nowText(null), "");

console.log(`OK — render escaping verified (${checks} hostile-text renders, 6 payloads)`);
