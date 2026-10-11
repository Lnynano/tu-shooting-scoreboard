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
console.log(`OK — ${checks} comparisons against the prototype logic matched`);
