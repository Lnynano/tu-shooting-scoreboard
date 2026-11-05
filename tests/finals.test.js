// Run: node tests/finals.test.js
// Final standings: elimination order and places, shoot-offs, fewer finalists, whole-number pistol, start list from qualification.
const assert = require("assert");
global.Scoring = require("../js/scoring.js");
const F = require("../js/finals.js");

// finalist with a constant shot value (or an explicit list)
const fin = (id, pos, shots, so) => ({ id, name: id, final_pos: pos, final_shots: Array.isArray(shots) ? shots : Array(24).fill(shots), final_so: so || {} });
const places = (st) => Object.fromEntries(st.rows.filter((r) => r.place).map((r) => [r.a.id, r.place]));

// --- elimination schedule
assert.deepStrictEqual(F.elimPoints(8), [12, 14, 16, 18, 20, 22]);
assert.deepStrictEqual(F.elimPoints(4), [20, 22]);
assert.deepStrictEqual(F.elimPoints(2), []);
assert.strictEqual(F.stageOf(1), "S1"); assert.strictEqual(F.stageOf(10), "S2"); assert.strictEqual(F.stageOf(11), "single");

// --- full 8-athlete rifle final, distinct levels: lowest goes first
{
  const v = ["10.8", "10.7", "10.6", "10.5", "10.4", "10.3", "10.2", "10.1"];
  const st = F.standing(v.map((x, i) => fin("A" + (i + 1), i + 1, x)), "dec");
  assert.strictEqual(st.status, "done");
  assert.deepStrictEqual(places(st), { A1: 1, A2: 2, A3: 3, A4: 4, A5: 5, A6: 6, A7: 7, A8: 8 });
  const a8 = st.rows.find((r) => r.a.id === "A8");
  assert.strictEqual(a8.outAt, 12); assert.strictEqual(a8.shots, 12); assert.strictEqual(a8.total, 12 * 101, "shots after elimination ignored");
  assert.strictEqual(st.rows.find((r) => r.a.id === "A3").outAt, 22);
  assert.strictEqual(st.rows[0].a.id, "A1", "winner listed first");
  assert.strictEqual(st.nextShot, 25);
}

// --- running: next shot, nobody out before shot 12, order by total
{
  const st = F.standing([fin("P", 1, ["10.0", "9.0"]), fin("Q", 2, ["10.5", "10.5", "10.5"])], "dec");
  assert.strictEqual(st.status, "running"); assert.strictEqual(st.nextShot, 3);
  assert.deepStrictEqual(st.rows.map((r) => r.a.id), ["Q", "P"]);
  const eight = Array.from({ length: 8 }, (_, i) => fin("B" + i, i + 1, Array(11).fill("10.0")));
  assert.strictEqual(F.standing(eight, "dec").rows.filter((r) => r.out).length, 0, "no elimination before shot 12");
}

// --- tie for last at shot 12 -> shoot-off, then resolved; multi-round
{
  const base = () => Array.from({ length: 8 }, (_, i) => fin("C" + i, i + 1, Array(12).fill(i < 6 ? "10.5" : "9.0")));
  let st = F.standing(base(), "dec");
  assert.strictEqual(st.status, "shootoff");
  assert.deepStrictEqual(st.shootoff, { at: 12, ids: ["C6", "C7"], round: 0, forGold: false });
  const b = base(); b[6].final_so = { 12: ["10.2", "9.9"] }; b[7].final_so = { 12: ["10.2", "10.4"] };
  st = F.standing(b, "dec");
  assert.strictEqual(st.status, "running");
  assert.strictEqual(places(st).C6, 8, "lower shoot-off shot (2nd round) is out");
  b[6].final_so = { 12: ["10.2"] };
  assert.deepStrictEqual(F.standing(b, "dec").shootoff, { at: 12, ids: ["C6", "C7"], round: 1, forGold: false }, "still tied after round 1");
}

// --- tie for gold -> shoot-off for gold; the higher shot wins
{
  const two = [fin("G", 1, "10.5"), fin("H", 2, "10.5")];
  assert.deepStrictEqual(F.standing(two, "dec").shootoff, { at: 24, ids: ["G", "H"], round: 0, forGold: true });
  two[0].final_so = { 24: ["10.1"] }; two[1].final_so = { 24: ["10.6"] };
  const st = F.standing(two, "dec");
  assert.strictEqual(st.status, "done"); assert.deepStrictEqual(places(st), { H: 1, G: 2 });
}

// --- fewer finalists: 4 -> eliminations after shots 20 and 22, still 2 shoot for gold at 24
{
  const st = F.standing([fin("D1", 1, "10.4"), fin("D2", 2, "10.3"), fin("D3", 3, "10.2"), fin("D4", 4, "10.1")], "dec");
  assert.deepStrictEqual(places(st), { D1: 1, D2: 2, D3: 3, D4: 4 });
  assert.strictEqual(st.rows.find((r) => r.a.id === "D4").outAt, 20);
  assert.strictEqual(F.standing([fin("E", 1, "10.0")], "dec").status, "waiting");
}

// --- pistol (whole numbers): X counts 10, decimals and junk are not valid shots
{
  const st = F.standing([fin("X1", 1, ["X", "10", "9"]), fin("X2", 2, ["10.5", "10"])], "int");
  assert.strictEqual(st.rows.find((r) => r.a.id === "X1").total, 290);
  assert.strictEqual(st.rows.find((r) => r.a.id === "X2").shots, 0, "10.5 is not a pistol shot: counting stops there");
  assert.deepStrictEqual(F.shotVals(["10.4", "", "9.9"], "dec"), [104], "stops at the first empty box");
  assert.ok(F.hasFinal("ap60") && F.hasFinal("ar40") && !F.hasFinal("p25") && !F.hasFinal("r3p60"));
  assert.strictEqual(F.modeOf("ap60"), "int"); assert.strictEqual(F.modeOf("ar60"), "dec");
}

// --- start list from qualification: top 8; an exact tie for 8th is left for staff to choose
{
  const q = (id, s) => ({ id, name: id, uni: "", cat: "W", relay: "1", lane: id, shots: [], ser: [s, s, s] });
  const ten = Array.from({ length: 10 }, (_, i) => q("Q" + i, String(99 - i)));
  assert.deepStrictEqual(F.startList(ten, "W", "ap30"), { ids: ["Q0", "Q1", "Q2", "Q3", "Q4", "Q5", "Q6", "Q7"], tie: [] });
  ten[8].ser = ten[7].ser.slice();   // Q8 now exactly equal to Q7 (same series, no shots)
  assert.deepStrictEqual(F.startList(ten, "W", "ap30"), { ids: ["Q0", "Q1", "Q2", "Q3", "Q4", "Q5", "Q6"], tie: ["Q7", "Q8"] });
  assert.deepStrictEqual(F.startList(ten.slice(0, 3), "W", "ap30").ids, ["Q0", "Q1", "Q2"], "fewer than 8: everyone");
}

// --- medals(): from qualification without a final; none while the final runs; from the final once it is done
{
  const q = (id, uni, s, extra) => ({ id, name: id, uni, cat: "W", relay: "1", lane: id, shots: [], ser: [s, s, s], ...extra });
  const comp = { event: "ar30", team_size: 2 };
  const list = [q("Q1", "TU", "100.0"), q("Q2", "KU", "99.0"), q("Q3", "TU", "98.0"), q("Q4", "CU", "97.0")];
  let m = F.medals(comp, list);
  assert.deepStrictEqual(m.W.ind.map((w) => w.name), ["Q1", "Q2", "Q3"], "no final: qualification order");
  assert.deepStrictEqual(m.finalState, { W: null, M: null });
  // final started (Q1..Q4), only a few shots in -> no individual medals yet, team medals unchanged
  const started = list.map((a, i) => ({ ...a, final_pos: i + 1, final_shots: ["10.0"] }));
  m = F.medals(comp, started);
  assert.deepStrictEqual(m.W.ind, []); assert.strictEqual(m.finalState.W, "running");
  assert.deepStrictEqual(m.W.team.map((t) => t.uni), ["TU", "KU", "CU"], "team medals stay on qualification");
  // bronze already decided (out after shot 22) but gold not yet: still no individual medals
  const at22 = { Q1: "10.1", Q2: "10.2", Q3: "10.3", Q4: "10.9" };
  m = F.medals(comp, started.map((a) => ({ ...a, final_shots: Array(22).fill(at22[a.id]) })));
  assert.strictEqual(m.finalState.W, "running"); assert.deepStrictEqual(m.W.ind, [], "no medals until gold is decided");
  // final done: Q4 wins the final although 4th in qualification
  const vals = { Q1: "10.1", Q2: "10.2", Q3: "10.3", Q4: "10.9" };
  m = F.medals(comp, started.map((a) => ({ ...a, final_shots: Array(24).fill(vals[a.id]) })));
  assert.strictEqual(m.finalState.W, "done");
  assert.deepStrictEqual(m.W.ind.map((w) => [w.place, w.name]), [[1, "Q4"], [2, "Q3"], [3, "Q2"]], "medals from the final");
  assert.strictEqual(m.W.ind[0].total, 24 * 109);
  // events without a final (25m pistol) ignore final columns completely
  assert.strictEqual(F.medals({ event: "p25", team_size: 2 }, started).finalState.W, null);
}

console.log("OK — finals: elimination order, shoot-offs, small fields, pistol whole numbers, start list");
