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
  for (let tab = 0; tab < 4; tab++) {
    const scored = athletes.map((a) => ({ ...a, cat: tab < 2 ? "W" : "M", ser: ["95", "94", "93"] }));
    const p = R.podiumHTML({ athletes: scored, event: "ap30", teamSize: 3, tab });
    assertSafe(p.html + p.title + p.info, `podiumHTML tab ${tab} / ${evil.slice(0, 18)}`);
    checks++;
  }
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

// --- podium: top 3 laid out 2-1-3, ties share a step, unscored athletes and empty teams left out
{
  const a = (id, name, uni, s, cat = "W") => ({ id, name, uni, cat, relay: "1", lane: id, shots: [], ser: s });
  const list = [a("1", "Gold", "TU", ["98", "97", "96-5x"]), a("2", "Silver", "KU", ["97", "97", "96"]), a("3", "BronzeA", "CU", ["95", "95", "95"]),
    a("4", "BronzeB", "MU", ["95", "95", "95"]), a("5", "Fifth", "TU", ["90", "90", "90"]), a("6", "NoScore", "TU", [])];
  const p = R.podiumHTML({ athletes: list, event: "ap30", teamSize: 2, tab: 0 });
  const cols = p.html.split('<div class="pcol ').slice(1).map((c) => c.slice(0, 2) + " " + (c.match(/class="pname">([^<]+)/g) || []).map((m) => m.slice(14)).join(","));
  assert.deepStrictEqual(cols, ['p2 Silver', 'p1 Gold', 'p3 BronzeA,BronzeB'], "2-1-3 order; exact tie shares 3rd");
  assert.ok(p.html.includes("291<small>5x</small>"), "integer events show X count");
  assert.ok(!p.html.includes("Fifth") && !p.html.includes("NoScore"));
  const t = R.podiumHTML({ athletes: list, event: "ap30", teamSize: 2, tab: 1 });
  const first = t.html.split('class="pcol p1"')[1].split('class="pcol p3"')[0];
  assert.ok(first.includes(">TU<") && first.includes("Gold · Fifth") && first.includes(">561<"), "team winner: TU, counted members, best-2 total");
  const dec = R.podiumHTML({ athletes: [a("r", "Rifle", "TU", ["104.5", "100.0", "99.9"])], event: "ar30", teamSize: 3, tab: 0 });
  assert.ok(dec.html.includes(">304.4<") && !dec.html.includes("<small>"), "decimal total, no X");
  assert.ok(R.podiumHTML({ athletes: [], event: "ap30", teamSize: 3, tab: 2 }).html.includes('class="empty"'), "empty category message");
}

// --- board auto-cycle skips empty tabs (tabs: women, women team, men, men team)
assert.strictEqual(R.nextTab(0, 1, [3, 1, 4, 2]), 1, "normal step");
assert.strictEqual(R.nextTab(1, 1, [0, 0, 4, 2]), 2, "skips nothing when next is full");
assert.strictEqual(R.nextTab(3, 1, [0, 0, 4, 2]), 2, "wraps past the empty women tabs");
assert.strictEqual(R.nextTab(2, -1, [0, 0, 4, 2]), 3, "backwards also skips");
assert.strictEqual(R.nextTab(2, 1, [0, 0, 4, 0]), 2, "only one tab has rows: stay on it");
assert.strictEqual(R.nextTab(0, 1, [0, 0, 0, 0]), 1, "all empty: plain step");
assert.deepStrictEqual(R.tabCounts([{ cat: "M", uni: "TU" }, { cat: "M", uni: "KU" }, { cat: "W", uni: "" }]), [1, 0, 2, 2], "counts athletes and teams per tab");

console.log(`OK — render escaping verified (${checks} hostile-text renders, 6 payloads)`);
