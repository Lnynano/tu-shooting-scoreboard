/* Finals (10m Air Pistol / 10m Air Rifle): pure logic, no DOM, no network.
   Format: up to 8 finalists start from zero. Shots 1-10 are two 5-shot series, then single shots.
   From shot 12 the lowest shooter is out after every 2nd shot until 2 are left; gold / silver after shot 24.
   With fewer finalists the eliminations start later, so the final still ends with 2 shooting for gold at shot 24.
   Ties at an elimination (or for gold) are decided by shoot-off shots, never by countback.
   Scores are x10 integers like the rest of the app. Air rifle = decimal (10.4); air pistol = whole numbers (paper targets, X = 10).
   A finalist is an athlete row with final_pos (start position 1-8), final_shots ["10.4", ...] and
   final_so {"12": ["10.1", "9.8"]} (shoot-off shots, keyed by the shot number where the tie happened). */
(function (root) {
  "use strict";
  const S = root.Scoring || (typeof require !== "undefined" ? require("./scoring.js") : null);

  // Every number of the format lives here; a rule change is a one-line edit.
  const FINAL = { shots: 24, series: [5, 5], step: 2, maxFinalists: 8, minFinalists: 2 };

  // Only these events have a final; pistol keeps whole-number scoring, rifle is decimal.
  const FINAL_MODE = { ap60: "int", ap40: "int", ap30: "int", ar60: "dec", ar40: "dec", ar30: "dec" };
  const hasFinal = (key) => key in FINAL_MODE;
  const modeOf = (key) => FINAL_MODE[key] || "dec";

  // Shot numbers after which someone is eliminated, for n finalists: 8 -> [12,14,16,18,20,22]; 4 -> [20,22]; 2 -> [].
  function elimPoints(n) {
    const out = [];
    for (let s = FINAL.shots - FINAL.step * (n - 2); s < FINAL.shots; s += FINAL.step) out.push(s);
    return out;
  }

  // one final shot: the shared shot parser (int: 0-10 or X = 10, dec: 0.0-10.9); null = empty, false = invalid
  const parse = (raw, mode) => S.parseShot(raw, mode);
  // values of the leading valid shots (stops at the first empty / invalid box)
  function shotVals(arr, mode) {
    const out = [];
    for (const raw of arr || []) { const p = parse(raw, mode); if (!p) break; out.push(p.t); }
    return out;
  }
  const sum = (vals, upTo) => vals.slice(0, upTo).reduce((s, v) => s + v, 0);

  // Shoot-off among tied athletes at shot `at`: round by round, keep the lowest (pick "low") or highest ("high").
  // -> {done:true, pick} | {done:false, ids, round} (those athletes still need shoot-off shot number `round`+1)
  function shootOff(cands, at, mode, pick) {
    let left = cands, round = 0;
    while (left.length > 1) {
      const vals = left.map((a) => { const p = parse(((a.final_so || {})[at] || [])[round], mode); return p ? p.t : null; });
      if (vals.some((v) => v === null)) return { done: false, ids: left.map((a) => a.id), round };
      const best = pick === "low" ? Math.min(...vals) : Math.max(...vals);
      left = left.filter((_, i) => vals[i] === best);
      round++;
    }
    return { done: true, pick: left[0] };
  }

  /* Current standing of a final.
     finalists: athlete rows with final_pos set (any order); mode: "int" | "dec".
     -> { rows: [{a, total, shots, place, out, outAt}], status, shootoff, nextShot }
        rows: still shooting first (highest total first), then those out (best place first)
        status: "waiting" (fewer than 2 finalists) | "running" | "shootoff" | "done"
        shootoff: {at, ids, round, forGold} while a tie must be shot off
        nextShot: the next shot number to enter for those still shooting (25 when finished) */
  function standing(finalists, mode) {
    const list = [...finalists].sort((p, q) => (p.final_pos || 99) - (q.final_pos || 99));
    const vals = new Map(list.map((a) => [a.id, shotVals(a.final_shots, mode)]));
    const cnt = (a) => vals.get(a.id).length;
    const place = new Map(), outAt = new Map();
    let alive = list.slice(), status = list.length < FINAL.minFinalists ? "waiting" : "running", so = null;

    if (status === "running") {
      for (const s of elimPoints(list.length)) {
        if (alive.some((a) => cnt(a) < s)) break;
        const t = alive.map((a) => sum(vals.get(a.id), s)), low = Math.min(...t);
        const tied = alive.filter((_, i) => t[i] === low);
        const r = tied.length === 1 ? { done: true, pick: tied[0] } : shootOff(tied, String(s), mode, "low");
        if (!r.done) { status = "shootoff"; so = { at: s, ids: r.ids, round: r.round, forGold: false }; break; }
        place.set(r.pick.id, alive.length); outAt.set(r.pick.id, s);
        alive = alive.filter((a) => a !== r.pick);
      }
      if (status === "running" && alive.length === 2 && alive.every((a) => cnt(a) >= FINAL.shots)) {
        const [p, q] = alive, tp = sum(vals.get(p.id), FINAL.shots), tq = sum(vals.get(q.id), FINAL.shots);
        const r = tp !== tq ? { done: true, pick: tp > tq ? p : q } : shootOff(alive, String(FINAL.shots), mode, "high");
        if (!r.done) { status = "shootoff"; so = { at: FINAL.shots, ids: r.ids, round: r.round, forGold: true }; }
        else { place.set(r.pick.id, 1); place.set((r.pick === p ? q : p).id, 2); outAt.set((r.pick === p ? q : p).id, FINAL.shots); status = "done"; }
      }
    }

    const rows = list.map((a) => {
      const v = vals.get(a.id), cap = outAt.has(a.id) ? outAt.get(a.id) : FINAL.shots;
      return { a, total: sum(v, cap), shots: Math.min(v.length, cap), place: place.get(a.id) || null, out: outAt.has(a.id) && place.get(a.id) !== 1, outAt: outAt.get(a.id) || null };
    });
    rows.sort((p, q) => (p.out - q.out) || (p.out ? p.place - q.place : (q.total - p.total) || ((p.a.final_pos || 99) - (q.a.final_pos || 99))));
    const shooting = rows.filter((r) => !r.out && !r.place);
    const nextShot = status === "done" ? FINAL.shots + 1 : shooting.length ? Math.min(...shooting.map((r) => r.shots)) + 1 : FINAL.shots + 1;
    return { rows, status, shootoff: so, nextShot };
  }

  // Which series / stage a shot number belongs to: 1-5 -> "S1", 6-10 -> "S2", then single shots.
  function stageOf(shot) {
    let end = 0;
    for (let i = 0; i < FINAL.series.length; i++) { end += FINAL.series[i]; if (shot <= end) return "S" + (i + 1); }
    return "single";
  }

  /* Start list from qualification: the top 8 scored athletes of a category.
     -> { ids: [...up to 8 in rank order], tie: [...ids sharing 8th place, more than fit] }
     When tie is not empty, staff choose who goes through (an exact tie for the last place is rare). */
  function startList(athletes, cat, key) {
    const scored = S.ranked(athletes, cat, key).filter((r) => r.st.any);
    const max = FINAL.maxFinalists;
    if (scored.length <= max || scored[max - 1].rank !== scored[max].rank) return { ids: scored.slice(0, max).map((r) => r.a.id), tie: [] };
    const cut = scored[max - 1].rank;
    return { ids: scored.filter((r) => r.rank < cut).map((r) => r.a.id), tie: scored.filter((r) => r.rank === cut).map((r) => r.a.id) };
  }

  const api = { FINAL, FINAL_MODE, hasFinal, modeOf, elimPoints, shotVals, shootOff, standing, stageOf, startList };
  root.Finals = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
