/* Pure scoring logic (no DOM, no network). Ported from prototype/issf-scorer.html.
   Athletes are plain objects: {id,name,uni,cat,relay,lane,shots:[],ser:[]}.
   Scores are handled x10 as integers (10.4 -> 104; integer 9 -> 90; X -> 100 plus an inner-ten flag). */
(function (root) {
  "use strict";

  const EVENTS = {
    ap60: { name: "10m Air Pistol — 60 นัด", nameEn: "10m Air Pistol — 60 shots", shots: 60, mode: "int" },
    ar60: { name: "10m Air Rifle — 60 นัด", nameEn: "10m Air Rifle — 60 shots", shots: 60, mode: "dec" },
    ap40: { name: "10m Air Pistol — 40 นัด", nameEn: "10m Air Pistol — 40 shots", shots: 40, mode: "int" },
    ar40: { name: "10m Air Rifle — 40 นัด", nameEn: "10m Air Rifle — 40 shots", shots: 40, mode: "dec" },
    ap30: { name: "10m Air Pistol — 30 นัด (ซ้อม)", nameEn: "10m Air Pistol — 30 shots (practice)", shots: 30, mode: "int" },
    ar30: { name: "10m Air Rifle — 30 นัด (ซ้อม)", nameEn: "10m Air Rifle — 30 shots (practice)", shots: 30, mode: "dec" },
    r3p60: { name: "50m Rifle 3 Positions — 60 นัด", nameEn: "50m Rifle 3 Positions — 60 shots", shots: 60, mode: "int" },
    p25: { name: "25m Pistol — 60 นัด", nameEn: "25m Pistol — 60 shots", shots: 60, mode: "int" }
  };
  const TABS = [
    ["W", "ind", "บุคคลหญิง", "Women"],
    ["W", "team", "ทีมหญิง", "Women team"],
    ["M", "ind", "บุคคลชาย", "Men"],
    ["M", "team", "ทีมชาย", "Men team"]
  ];

  const ev = (key) => EVENTS[key] || EVENTS.ap60;
  const nSer = (key) => Math.ceil(ev(key).shots / 10);

  function parseShot(raw, mode) {
    const v = (raw || "").trim();
    if (v === "") return null;
    if (mode === "int") {
      if (/^[xX]$/.test(v)) return { t: 100, x: true, norm: "X" };
      if (/^(10|[0-9])$/.test(v)) return { t: +v * 10, x: false, norm: String(+v) };
      return false;
    }
    const m = v.replace(",", ".");
    if (!/^\d{1,2}(\.\d)?$/.test(m)) return false;
    const t = Math.round(parseFloat(m) * 10);
    if (t > 109) return false;
    return { t, x: false, norm: (t / 10).toFixed(1) };
  }

  function parseSeries(raw, mode) {
    const v = (raw || "").trim().replace(/\s+/g, "");
    if (v === "") return null;
    if (mode === "int") {
      const m = v.match(/^(\d{1,3})(?:[-\/]?(\d{1,2})[xX]?)?$/);
      if (!m) return false;
      const s = +m[1], x = m[2] ? +m[2] : 0;
      if (s > 100 || x > 10 || x * 10 > s) return false;
      return { t: s * 10, x, norm: x ? `${s}-${x}x` : String(s) };
    }
    const m = v.replace(",", ".").match(/^(\d{1,3}(?:\.\d)?)(?:[-\/]?(\d{1,2})[xX])?$/);
    if (!m) return false;
    const t = Math.round(parseFloat(m[1]) * 10), x = m[2] ? +m[2] : 0;
    if (t > 1090 || x > 10) return false;
    return { t, x, norm: (t / 10).toFixed(1) + (x ? `-${x}x` : "") };
  }

  const fmtT = (t, mode) => (mode === "dec" ? (t / 10).toFixed(1) : String(Math.round(t / 10)));
  const serHas = (a, k) => (a.shots || []).slice(k * 10, k * 10 + 10).some(Boolean);

  // A series uses per-shot values if any shot in it is entered, otherwise the series-total entry.
  function stats(a, key) {
    const e = ev(key), n = nSer(key), ser = [], vals = [];
    let total = 0, x = 0, count = 0;
    for (let k = 0; k < n; k++) {
      let st = { t: 0, x: 0, has: false, from: "none" };
      if (serHas(a, k)) {
        st.from = "shots";
        for (let j = 0; j < 10; j++) {
          const i = k * 10 + j;
          if (i >= e.shots) break;
          const p = parseShot(a.shots[i], e.mode);
          vals.push(p ? p.t : 0);
          if (p) { st.t += p.t; if (p.x) st.x++; count++; st.has = true; }
        }
      } else {
        const p = parseSeries((a.ser || [])[k], e.mode);
        for (let j = 0; j < 10 && k * 10 + j < e.shots; j++) vals.push(0);
        if (p) { st = { t: p.t, x: p.x, has: true, from: "series" }; count += Math.min(10, e.shots - k * 10); }
      }
      ser.push(st); total += st.t; x += st.x;
    }
    return { total, x, count, ser, vals, any: ser.some((s) => s.has) };
  }

  // Tie-break: total -> X (integer events only) -> last series backwards -> last shot backwards.
  function cmp(a, b, mode) {
    if (b.st.total !== a.st.total) return b.st.total - a.st.total;
    if (mode === "int" && b.st.x !== a.st.x) return b.st.x - a.st.x;
    for (let i = a.st.ser.length - 1; i >= 0; i--) if (b.st.ser[i].t !== a.st.ser[i].t) return b.st.ser[i].t - a.st.ser[i].t;
    for (let i = a.st.vals.length - 1; i >= 0; i--) if (b.st.vals[i] !== a.st.vals[i]) return b.st.vals[i] - a.st.vals[i];
    return 0;
  }

  function ranked(athletes, cat, key) {
    const mode = ev(key).mode;
    const list = athletes.filter((a) => (a.cat || "W") === cat).map((a) => ({ a, st: stats(a, key) }));
    const scored = list.filter((r) => r.st.any).sort((p, q) => cmp(p, q, mode));
    const rest = list.filter((r) => !r.st.any).sort((p, q) =>
      (p.a.relay || "").localeCompare(q.a.relay || "") ||
      String(p.a.lane || "").localeCompare(String(q.a.lane || ""), undefined, { numeric: true }));
    scored.forEach((r, i) => { r.rank = i > 0 && cmp(scored[i - 1], r, mode) === 0 ? scored[i - 1].rank : i + 1; });
    return scored.concat(rest);
  }

  // Team = athletes grouped by uni within a category; score = best N members; rank by total then X.
  function teams(athletes, cat, key, teamSize) {
    const size = +teamSize || 3, groups = new Map();
    ranked(athletes, cat, key).forEach((r) => {
      const u = (r.a.uni || "").trim();
      if (!u) return;
      if (!groups.has(u)) groups.set(u, []);
      groups.get(u).push(r);
    });
    const out = [...groups.entries()].map(([uni, mem]) => {
      const counted = mem.filter((r) => r.st.any).slice(0, size);
      return { uni, mem, counted, total: counted.reduce((s, r) => s + r.st.total, 0), x: counted.reduce((s, r) => s + r.st.x, 0) };
    }).sort((p, q) => q.total - p.total || q.x - p.x);
    out.forEach((t, i) => { t.rank = i > 0 && out[i - 1].total === t.total && out[i - 1].x === t.x ? out[i - 1].rank : i + 1; });
    return out;
  }

  const normCat = (raw) => (/^(m|ชาย|men|male|man)/.test(String(raw || "").trim().toLowerCase()) ? "M" : "W");

  // Pasted rows: name, uni, cat, relay, lane, S1..Sn (tab or comma separated; header row skipped).
  function parseImport(text, key) {
    const e = ev(key), rows = [];
    let bad = 0;
    String(text).split(/\r?\n/).forEach((line) => {
      if (!line.trim()) return;
      const c = line.includes("\t") ? line.split("\t") : line.split(",");
      const name = (c[0] || "").trim();
      if (!name || /^(name|ชื่อ|ชื่อ-สกุล)$/i.test(name)) return;
      const ser = [];
      for (let k = 0; k < nSer(key); k++) {
        const v = (c[5 + k] || "").trim();
        if (!v) { ser.push(""); continue; }
        const p = parseSeries(v, e.mode);
        if (p) ser.push(p.norm); else { ser.push(""); bad++; }
      }
      rows.push({ name, uni: (c[1] || "").trim(), cat: normCat(c[2]), relay: (c[3] || "").trim(), lane: (c[4] || "").trim(), shots: [], ser });
    });
    return { rows, bad };
  }

  function toCSV(athletes, key, teamSize, title) {
    const e = ev(key), n = nSer(key);
    const q = (v) => (/[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : v);
    const out = [[`# ${title || ""}`, e.name]];
    for (const cat of ["W", "M"]) {
      const label = cat === "W" ? "Women" : "Men";
      out.push([], [label], ["Rank", "Relay", "Lane", "Team", "Name", ...Array.from({ length: n }, (_, i) => "S" + (i + 1)), "Total", "X"]);
      ranked(athletes, cat, key).forEach((r) => out.push([
        r.st.any ? r.rank : "", r.a.relay, r.a.lane, r.a.uni, r.a.name,
        ...r.st.ser.map((s) => (s.has ? fmtT(s.t, e.mode) : "")),
        r.st.any ? fmtT(r.st.total, e.mode) : "", r.st.x]));
      out.push([], [label + " team"], ["Rank", "Team", "Total", "X", "Counted"]);
      teams(athletes, cat, key, teamSize).forEach((t) => out.push([t.rank, t.uni, fmtT(t.total, e.mode), t.x, t.counted.map((r) => r.a.name).join(" / ")]));
    }
    return out.map((r) => r.map(q).join(",")).join("\n");
  }

  const api = { EVENTS, TABS, ev, nSer, parseShot, parseSeries, fmtT, serHas, stats, cmp, ranked, teams, normCat, parseImport, toCSV };
  root.Scoring = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
