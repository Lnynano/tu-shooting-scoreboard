const fs = require("fs");
const path = require("path");
const vm = require("vm");
const assert = require("assert");
const S = require("../js/scoring.js");

const html = fs.readFileSync(path.join(__dirname, "../prototype/issf-scorer.html"), "utf8");
const script = html.slice(html.indexOf("<script>") + 8, html.indexOf("/* ---------- persistence"));
const ctx = vm.createContext({ localStorage: { getItem() { return null; }, setItem() {} } });
const idOfSrc = "function idOf(a){for(const [k,v] of A) if(v===a) return k; return ''}";
vm.runInContext(script + ";\n" + idOfSrc, ctx);
const P = (code) => vm.runInContext(code, ctx);

let seed = 12345;
const rnd = (n) => { seed = (seed * 1664525 + 1013904223) % 4294967296; return Math.floor((seed / 4294967296) * n); };
const pick = (arr) => arr[rnd(arr.length)];

function makeAthlete(i, key) {
  const e = S.ev(key), n = S.nSer(key);
  const a = { id: "a" + i, name: "N" + i, uni: pick(["TU", "KU", "CU", "MU", ""]), cat: pick(["W", "M"]),
    relay: String(rnd(3)), lane: String(1 + rnd(8)), shots: [], ser: [] };
  const mode = pick(["none", "series", "shots", "mixed"]);
  for (let k = 0; k < n; k++) {
    const useShots = mode === "shots" || (mode === "mixed" && rnd(2));
    const useSer = !useShots && mode !== "none" && rnd(5) > 0;
    if (useShots && rnd(6) > 0) {
      for (let j = 0; j < 10 && k * 10 + j < e.shots; j++) {
        if (rnd(8) === 0) continue; 
        a.shots[k * 10 + j] = e.mode === "int" ? pick(["X", "10", "9", "9", "8", "7", "0"]) : (8 + rnd(28) / 10).toFixed(1);
      }
    }
    if (useSer) a.ser[k] = e.mode === "int" ? pick(["89-1x", "90", "88-2x", "91-0x", "85"]) : pick(["102.4", "100.0", "99.9", "101.5"]);
  }
  for (let i2 = 0; i2 < a.shots.length; i2++) if (a.shots[i2] === undefined) a.shots[i2] = "";
  return a;
}

let checks = 0;
for (const key of Object.keys(S.EVENTS)) {
  const mode = S.ev(key).mode;

  for (const raw of ["", "X", "x", "10", "11", "9", "-1", "10.9", "11.0", "8,5", "abc", "89-1x", "89", "89 1x", "102.4", "109.0", "110.0", "5-1x", "100-0x", "101", "99.9-2x"]) {
    assert.strictEqual(JSON.stringify(S.parseShot(raw, mode)), P(`JSON.stringify(parseShot(${JSON.stringify(raw)},${JSON.stringify(mode)}))`), `parseShot ${raw}`);
    assert.strictEqual(JSON.stringify(S.parseSeries(raw, mode)), P(`JSON.stringify(parseSeries(${JSON.stringify(raw)},${JSON.stringify(mode)}))`), `parseSeries ${raw}`);
    checks += 2;
  }
  for (let round = 0; round < 60; round++) {
    const N = 4 + rnd(24), teamSize = 2 + rnd(3);
    const athletes = Array.from({ length: N }, (_, i) => makeAthlete(i, key));
    P(`META.event=${JSON.stringify(key)};META.teamSize=${teamSize};A.clear()`);
    ctx.__in = athletes.map((a) => [a.id, { name: a.name, uni: a.uni, cat: a.cat, round: a.relay, lane: a.lane, shots: [...a.shots], ser: [...a.ser] }]);
    P("__in.forEach(([k,v])=>A.set(k,v))");
    for (const a of athletes) {
      const ps = P(`JSON.stringify(stats(A.get(${JSON.stringify(a.id)})))`);
      assert.strictEqual(JSON.stringify(S.stats(a, key)), ps, `stats ${key} ${a.id}`);
      checks++;
    }
    for (const cat of ["W", "M"]) {
      const mine = S.ranked(athletes, cat, key).map((r) => `${r.a.id}:${r.st.any ? r.rank : "-"}`);
      const proto = JSON.parse(P(`JSON.stringify(ranked(${JSON.stringify(cat)}).map(r=>idOf(r.a)+":"+(r.st.any?r.rank:"-")))`));
      assert.deepStrictEqual(mine, proto, `ranked ${key} ${cat}`);
      const t1 = S.teams(athletes, cat, key, teamSize).map((t) => [t.uni, t.rank, t.total, t.x, t.mem.map((r) => r.a.id), t.counted.map((r) => r.a.id)]);
      const t2 = JSON.parse(P(`JSON.stringify(teams(${JSON.stringify(cat)}).map(t=>[t.uni,t.rank,t.total,t.x,t.mem.map(r=>idOf(r.a)),t.counted.map(r=>idOf(r.a))]))`));
      assert.deepStrictEqual(t1, t2, `teams ${key} ${cat}`);
      checks += 2;
    }
  }
}


{
  const mk = (id, ser) => ({ id, cat: "W", uni: "", name: id, shots: [], ser });

  let r = S.ranked([mk("a", ["90-1x"]), mk("b", ["90-3x"])], "W", "ap30");
  assert.deepStrictEqual(r.map((x) => x.a.id), ["b", "a"]);

  r = S.ranked([mk("a", ["100.0", "101.0"]), mk("b", ["101.0", "100.0"])], "W", "ar30");
  assert.deepStrictEqual(r.map((x) => x.a.id), ["a", "b"]);
  assert.strictEqual(S.fmtT(S.stats(mk("a", ["89-1x"]), "ap30").total, "int"), "89");
}
// Team name matching: spelling variants are one team, most common spelling is shown
{
  const mk = (id, uni, ser) => ({ id, cat: "W", uni, name: id, shots: [], ser });
  const ath = [mk("a", "TU", ["90"]), mk("b", "tu", ["89"]), mk("c", " TU  ", ["88"]), mk("d", "T U", ["99"]), mk("e", "KU", ["91"])];
  const t = S.teams(ath, "W", "ap30", 3);
  const tu = t.find((x) => x.uni === "TU");
  assert.ok(tu, "TU team exists");
  assert.deepStrictEqual(tu.mem.map((r) => r.a.id).sort(), ["a", "b", "c"], "TU / tu / ' TU  ' are one team");
  assert.strictEqual(tu.total, (90 + 89 + 88) * 10);
  assert.ok(t.find((x) => x.uni === "T U"), "'T U' (different letters/spacing inside) stays a separate team");
  assert.strictEqual(S.teams([mk("p", "มหาวิทยาลัย  ธรรมศาสตร์", ["90"]), mk("q", "มหาวิทยาลัย ธรรมศาสตร์", ["90"])], "W", "ap30", 3).length, 1, "extra inner spaces ignored");
  assert.strictEqual(S.teams([mk("x", "KU", ["90"]), mk("y", "ku", ["90"]), mk("z", "ku", ["90"])], "W", "ap30", 3)[0].uni, "ku", "most common spelling wins");
}
// --- CSV / TSV: text that starts like a formula is neutralised; numbers and normal text are not touched
{
  assert.strictEqual(S.safeCell("=HYPERLINK(\"http://x\")"), "'=HYPERLINK(\"http://x\")");
  for (const t of ["+1", "-2", "@SUM(A1)", "\tx", "\rx"]) assert.strictEqual(S.safeCell(t), "'" + t, JSON.stringify(t));
  for (const t of ["TU", "สมหญิง", "1", "95.4", "", 5, -3, null]) assert.strictEqual(S.safeCell(t), t, JSON.stringify(t));
  const evil = [{ id: "e", name: "=1+1", uni: "@TU", cat: "W", relay: "1", lane: "1", shots: [], ser: ["90"] }];
  const csv = S.toCSV(evil, "ap30", 3, "t"), tsv = S.toTSV(evil, "ap30", 3, "t");
  assert.ok(csv.includes(",'=1+1,") && csv.includes(",'@TU,"), "CSV cells prefixed");
  assert.ok(tsv.includes("\t'=1+1\t") && !/(^|\t)=/m.test(tsv), "TSV cells prefixed, no cell starts with =");
}

// --- athletes with no score yet are listed by relay as a number: 2 before 10
{
  const r = (id, relay, lane) => ({ id, name: id, uni: "", cat: "W", relay, lane, shots: [], ser: [] });
  const order = S.ranked([r("a", "10", "1"), r("b", "2", "1"), r("c", "1", "2"), r("d", "1", "10"), r("e", "", "1")], "W", "ap60").map((x) => x.a.id);
  assert.deepStrictEqual(order, ["e", "c", "d", "b", "a"], "relay and lane sorted numerically");
}

// --- medals(): top 3 per category, exact ties share a place, unscored left out, teams list counted members
{
  const r = (id, cat, uni, ser) => ({ id, name: "N" + id, uni, cat, relay: "1", lane: id, shots: [], ser });
  const list = [r("1", "W", "TU", ["98", "97", "96"]), r("2", "W", "KU", ["97", "97", "96"]), r("3", "W", "CU", ["95", "95", "95"]),
    r("4", "W", "MU", ["95", "95", "95"]), r("5", "W", "TU", ["90", "90", "90"]), r("6", "W", "TU", []), r("7", "M", "", ["90", "90", "90"]), r("8", "M", "ZU", [])];
  const m = S.medals(list, "ap30", 2);
  assert.deepStrictEqual(m.W.ind.map((w) => [w.place, w.name]), [[1, "N1"], [2, "N2"], [3, "N3"], [3, "N4"]], "women individual medals with shared bronze");
  assert.deepStrictEqual(m.W.team.map((t) => [t.place, t.uni, t.members.join("+")]), [[1, "TU", "N1+N5"], [2, "KU", "N2"], [3, "CU", "N3"], [3, "MU", "N4"]], "team medals: counted members only");
  assert.strictEqual(m.W.team[0].total, (291 + 270) * 10);
  assert.deepStrictEqual(m.M.ind.map((w) => w.name), ["N7"]);
  assert.deepStrictEqual(m.M.team, [], "no team without a team name, and no medal for a team with no score yet (ZU)");
}

console.log(`OK — ${checks} comparisons against the prototype logic matched`);
