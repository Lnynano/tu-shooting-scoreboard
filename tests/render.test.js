// Run: node tests/render.test.js
// render.js builds HTML strings from user-entered text (names, teams, relay, lane, competition names).
// Check that hostile text is escaped in every place it is used, in the board table and the athlete detail card.
const assert = require("assert");
global.window = global;
global.location = { search: "" };
global.I18n = { L: (th) => th };
global.Scoring = require("../js/scoring.js");
global.Finals = require("../js/finals.js");
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

// --- certificates: one page per medal winner (team: per counted member), all text escaped
{
  const a = (id, name, uni, s, cat = "W") => ({ id, name, uni, cat, relay: "1", lane: id, shots: [], ser: s });
  const list = [a("1", "Gold", "TU", ["98", "97", "96-5x"]), a("2", "Silver", "KU", ["97", "97", "96"]), a("3", "Bronze", "CU", ["95", "95", "95"]),
    a("5", "Mate", "TU", ["90", "90", "90"]), a("6", "Man", "TU", ["90", "90", "90"], "M")];
  const r = R.certificatesHTML({ name: "Cup", event: "ap30", team_size: 2 }, list, { date: "5 Nov 2026", signer: "Chair", signerTitle: "President" });
  // women: 3 individual + team TU (2 counted) + KU + CU = 7; men: 1 individual + team TU = 2
  assert.strictEqual(r.count, 9);
  assert.strictEqual((r.html.match(/<section class="cert m1">/g) || []).length, 5, "gold: Gold + women team TU (Gold, Mate) + Man + men team TU (Man)");
  assert.ok(r.html.includes("291 (5x)") && r.html.includes("5 Nov 2026") && r.html.includes("(Chair)") && r.html.includes("President"));
  assert.strictEqual(R.certificatesHTML({ name: "Empty", event: "ap30", team_size: 3 }, [], {}).count, 0);
  for (const evil of EVIL) {
    const h = R.certificatesHTML({ name: evil, event: "ar30", team_size: 3 }, [a("e", evil, evil, ["100.0", "100.0", "100.0"])], { date: evil, signer: evil, signerTitle: evil }).html;
    // remove the page's own logo and medal word first, then nothing tag-like may remain from the hostile text
    const own = h.replaceAll('<img class="clogo" src="img/logo-print.png" alt="" width="90" height="90">', "").replace(/<b>(เหรียญทอง|เหรียญเงิน|เหรียญทองแดง)<\/b>/g, "");
    assert.ok(!/<img\b/i.test(own) && !/<b>/.test(own), "only the page's own <img> and <b> tags");
    assertSafe(own, "certificatesHTML / " + evil.slice(0, 18));
    checks++;
  }
}

// --- final view: replaces the women individual table only when switched on; medal rows by place, not "out"
{
  const fa = (id, pos, v, cat = "W") => ({ id, name: "F" + id, uni: "TU", cat, relay: "1", lane: id, shots: [], ser: ["90"], final_pos: pos, final_shots: Array(24).fill(v), final_so: {} });
  const list = [fa("1", 1, "10.8"), fa("2", 2, "10.7"), fa("3", 3, "10.6"), fa("4", 4, "10.5"), { id: "q", name: "Qonly", uni: "", cat: "W", relay: "1", lane: "9", shots: [], ser: ["99"] }];
  const on = R.boardHTML({ athletes: list, event: "ar60", teamSize: 3, tab: 0, showFinal: true });
  assert.ok(on.title.includes("รอบชิง") && on.count.total === 4 && !on.tbody.includes("Qonly"), "final view: finalists only");
  assert.ok(/class="row final p2"[^>]*><td class="rank">🥈/.test(on.tbody), "silver row styled as medal, not as eliminated");
  assert.ok(/class="row final out"[^>]*><td class="rank">4</.test(on.tbody), "4th is out");
  assert.ok(on.tbody.indexOf("F1") < on.tbody.indexOf("F2") && on.tbody.includes("259.2"), "winner first, total 24 x 10.8");
  assert.ok(!R.boardHTML({ athletes: list, event: "ar60", teamSize: 3, tab: 0 }).title.includes("รอบชิง"), "switch off: qualification table");
  assert.ok(!R.boardHTML({ athletes: list, event: "ar60", teamSize: 3, tab: 1, showFinal: true }).title.includes("รอบชิง"), "team tab never shows the final");
  assert.ok(!R.boardHTML({ athletes: list, event: "p25", teamSize: 3, tab: 0, showFinal: true }).title.includes("รอบชิง"), "events without a final ignore it");
  for (const evil of EVIL) {
    const h = R.finalHTML({ athletes: [fa("e1", 1, "10.0"), { ...fa("e2", 2, "9.0"), name: evil, uni: evil }], event: "ar60", tab: 0 });
    assertSafe(h.thead + h.tbody + h.title + h.info, "finalHTML / " + evil.slice(0, 18));
    checks++;
  }
}

// --- certificates of a finished final say "Final score"; qualification medals keep "Score"
{
  const fa = (id, pos, v) => ({ id, name: "C" + id, uni: "TU", cat: "W", relay: "1", lane: id, shots: [], ser: ["100.0"], final_pos: pos, final_shots: Array(24).fill(v), final_so: {} });
  const h = R.certificatesHTML({ name: "Cup", event: "ar60", team_size: 3 }, [fa("1", 1, "10.5"), fa("2", 2, "10.0"), fa("3", 3, "9.5")], {}).html;
  assert.ok(h.includes("คะแนนรอบชิง 252.0"), "final score label on the winner");
  assert.ok(h.includes("คะแนนทีม "), "team certificates unchanged");
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
