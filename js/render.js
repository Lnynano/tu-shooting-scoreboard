/* Board table rendering shared by index.html, board.html and staff.html. Needs js/i18n.js + js/scoring.js. */
(function () {
  "use strict";
  const S = window.Scoring, L = window.I18n.L;
  const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const evName = (key) => { const e = S.ev(key); return L(e.name, e.nameEn); };

  function serCell(st, mode) {
    if (!st.has) return "·";
    return S.fmtT(st.t, mode) + (mode === "int" || st.x ? `<span class="x">-${st.x}x</span>` : "");
  }

  // individual tabs count athletes, team tabs count teams (same grouping as the team table)
  const tabCounts = (athletes) => S.TABS.map(([cat, kind]) =>
    kind === "ind" ? athletes.filter((a) => (a.cat || "W") === cat).length : S.teams(athletes, cat, "ap60", 3).length);

  function tabsHTML(tab, athletes) {
    const counts = tabCounts(athletes);
    return S.TABS.map(([, , th, en], i) =>
      `<button type="button" data-t="${i}" aria-pressed="${tab === i}">${L(th, en)}<span class="c">${counts[i]}</span></button>`).join("");
  }

  // Podium for one tab: top 3 (ties share a step), laid out 2 - 1 - 3. Only athletes / teams with a score.
  function podiumHTML(opts) {
    const { athletes, event, teamSize, tab } = opts;
    const e = S.ev(event), [cat, kind, th, en] = S.TABS[tab];
    const score = (t, x) => `${S.fmtT(t, e.mode)}${e.mode === "int" && x ? `<small>${x}x</small>` : ""}`;
    const all = window.Finals.medals({ event, team_size: teamSize }, athletes), m = all[cat][kind];
    const items = kind === "ind"
      ? m.map((w) => ({ rank: w.place, name: w.name, sub: w.uni, score: score(w.total, w.x) }))
      : m.map((w) => ({ rank: w.place, name: w.uni, sub: w.members.join(" · "), score: score(w.total, w.x) }));
    const title = L(th, en) + " — " + L("ผู้ชนะ", "Winners"), info = L(e.name, e.nameEn);
    if (kind === "ind" && all.finalState[cat] === "running") return { title, info, html: `<p class="empty">${L("รอบชิงชนะเลิศยังไม่จบ — ผู้ชนะจะแสดงเมื่อจบรอบชิง", "The final is still running — winners appear when it ends")}</p>` };
    if (!items.length) return { title, info, html: `<p class="empty">${L("ยังไม่มีผลในประเภทนี้", "No results in this category yet")}</p>` };
    const card = (i) => `<div class="pcard"><div class="pname">${esc(i.name)}</div>${i.sub ? `<div class="psub">${esc(i.sub)}</div>` : ""}<div class="pscore">${i.score}</div></div>`;
    const col = (place) => `<div class="pcol p${place}">${items.filter((i) => i.rank === place).map(card).join("")}<div class="pstep"><span>${place}</span></div></div>`;
    return { title, info, html: `<div class="podium">${[2, 1, 3].map(col).join("")}</div>` };
  }

  // Certificates for every medal winner (one A4 page each; a team gets one page per counted member).
  // opts: { date: "5 พฤศจิกายน 2569" (already formatted), signer, signerTitle }
  const MEDAL = { 1: ["เหรียญทอง", "Gold Medal", "อันดับที่ 1", "1st place"], 2: ["เหรียญเงิน", "Silver Medal", "อันดับที่ 2", "2nd place"], 3: ["เหรียญทองแดง", "Bronze Medal", "อันดับที่ 3", "3rd place"] };
  function certificatesHTML(comp, athletes, opts) {
    const o = opts || {}, e = S.ev(comp.event), m = window.Finals.medals(comp, athletes);
    const score = (t, x) => S.fmtT(t, e.mode) + (e.mode === "int" && x ? ` (${x}x)` : "");
    const pages = [];
    const page = (place, name, sub, catLabel, scoreLine) => {
      const [mth, men, pth, pen] = MEDAL[place];
      pages.push(`<section class="cert m${place}"><div class="frame">
  <img class="clogo" src="img/logo-print.png" alt="" width="90" height="90">
  <div class="corg">Thammasat Shooting Club</div>
  <h1 class="ctitle">${L("เกียรติบัตร", "Certificate of Achievement")}</h1>
  <p class="cline">${L("มอบให้ไว้เพื่อแสดงว่า", "This is to certify that")}</p>
  <div class="cname">${esc(name)}</div>
  ${sub ? `<div class="cuni">${esc(sub)}</div>` : ""}
  <p class="caward">${L("ได้รับรางวัล", "won the")} <b>${L(mth, men)}</b> <span class="cplace">(${L(pth, pen)})</span><span class="cmedal" aria-hidden="true">${place}</span></p>
  <p class="ccat">${esc(catLabel)} · ${esc(L(e.name, e.nameEn))} · ${esc(scoreLine)}</p>
  <p class="ccomp">${L("ในการแข่งขัน", "at")} ${esc(comp.name)}</p>
  ${o.date ? `<p class="cdate">${L("ให้ไว้ ณ วันที่", "Given on")} ${esc(o.date)}</p>` : ""}
  <div class="csign"><span class="sline"></span><div>${o.signer ? `(${esc(o.signer)})` : "&nbsp;"}</div><div class="stitle">${esc(o.signerTitle || "")}</div></div>
</div></section>`);
    };
    for (const [cat, ind, team] of [["W", ["บุคคลหญิง", "Women"], ["ทีมหญิง", "Women team"]], ["M", ["บุคคลชาย", "Men"], ["ทีมชาย", "Men team"]]]) {
      for (const w of m[cat].ind) page(w.place, w.name, w.uni, L("ประเภท" + ind[0], ind[1]), L("คะแนน ", "Score ") + score(w.total, w.x));
      for (const t of m[cat].team) for (const name of t.members)
        page(t.place, name, L("ทีม ", "Team ") + t.uni, L("ประเภท" + team[0], team[1]), L("คะแนนทีม ", "Team score ") + score(t.total, t.x));
    }
    return { count: pages.length, html: pages.join("\n") };
  }

  // Next tab in direction step (+1 / -1), skipping tabs with nothing in them (e.g. no women entered).
  // When every tab is empty it simply moves one step.
  function nextTab(tab, step, counts) {
    const n = counts.length;
    for (let k = 1; k <= n; k++) { const i = (((tab + step * k) % n) + n) % n; if (counts[i] > 0) return i; }
    return (((tab + step) % n) + n) % n;
  }

  const noActiveHTML = () => `<tr><td colspan="20" class="empty">${L("ยังไม่มีการแข่งขันที่เปิดแสดงอยู่", "No active competition")}</td></tr>`;

  // Filtering happens AFTER ranking, so a filtered list still shows each athlete's real rank.
  const norm = (s) => String(s || "").normalize("NFC").toLowerCase().trim();
  const hasFilter = (f) => !!(f && (norm(f.q) || f.relay));
  function matchAth(a, f) {
    if (f.relay && String(a.relay || "") !== f.relay) return false;
    const q = norm(f.q);
    return !q || norm(a.name).includes(q) || norm(a.uni).includes(q);
  }
  function matchTeam(t, f) {
    const q = norm(f.q), uniOk = !q || norm(t.uni).includes(q);
    return t.mem.some((r) => matchAth(r.a, { relay: f.relay, q: uniOk ? "" : f.q }));
  }

  /* opts: {athletes[], event, teamSize, tab, selectedId, clickable, loading, emptyHint, filter:{q,relay}}
     returns {title, info, thead, tbody} (HTML strings) */
  function boardHTML(opts) {
    const { athletes, event, teamSize, tab } = opts;
    const e = S.ev(event), n = S.nSer(event), [cat, kind, th, en] = S.TABS[tab];
    const cols = n + 7, f = hasFilter(opts.filter) ? opts.filter : null;
    let count = { shown: 0, total: 0 };
    let thead = `<tr><th class="l">#</th><th class="l c-relay">${L("ผลัด<small>Relay</small>", "Relay")}</th><th class="l c-lane">${L("ลู่<small>Lane</small>", "Lane")}</th><th class="l c-uni">${L("สังกัด<small>Univ.</small>", "Team")}</th><th class="l">${L("ชื่อ<small>Name</small>", "Name")}</th>`;
    for (let i = 1; i <= n; i++) thead += `<th class="c-ser">S${i}</th>`;
    thead += `<th>${L("รวม<small>Total</small>", "Total")}</th>${kind === "team" ? `<th>${L("ทีม<small>Team</small>", "Team")}</th>` : `<th>${L("นัด<small>Shots</small>", "Shots")}</th>`}</tr>`;

    const row = (r, rankCell, extra, cls = "") => `<tr class="row ${opts.clickable ? "click " : ""}${cls} ${r.a.id === opts.selectedId ? "sel" : ""} ${opts.nowRelay && String(r.a.relay || "") === opts.nowRelay ? "now" : ""}" data-id="${esc(r.a.id)}"${opts.clickable ? ' tabindex="0"' : ""}>
      <td class="rank">${rankCell}</td><td class="l c-relay">${esc(r.a.relay || "")}</td><td class="l c-lane">${esc(r.a.lane || "")}</td>
      <td class="uni c-uni">${esc(r.a.uni || "")}</td>
      <td class="name">${esc(r.a.name)}${r.st.count === e.shots ? `<span class="pill done">${L("ครบ", "Done")}</span>` : ""}${r.a.uni ? `<span class="name-uni">${esc(r.a.uni)}</span>` : ""}</td>
      ${r.st.ser.map((s) => `<td class="ser">${serCell(s, e.mode)}</td>`).join("")}
      <td class="total">${r.st.any ? S.fmtT(r.st.total, e.mode) + (e.mode === "int" || r.st.x ? `<span class="x">-${r.st.x}X</span>` : "") : "–"}</td>${extra}</tr>`;

    let tbody;
    if (opts.loading) {
      tbody = `<tr><td colspan="${cols}" class="empty">${L("กำลังโหลดผลการแข่งขัน…", "Loading results…")}</td></tr>`;
    } else if (kind === "ind") {
      const all = S.ranked(athletes, cat, event), list = f ? all.filter((r) => matchAth(r.a, f)) : all;
      count = { shown: list.length, total: all.length };
      tbody = list.length
        ? list.map((r) => row(r, r.st.any ? r.rank : "–", `<td>${r.st.count}/${e.shots}</td>`)).join("")
        : `<tr><td colspan="${cols}" class="empty">${f && all.length ? L("ไม่พบนักกีฬาที่ตรงกับตัวกรอง", "No athletes match the filter") : L("ยังไม่มีนักกีฬาในประเภทนี้", "No athletes in this category yet")}${!f && opts.emptyHint ? "<br>" + opts.emptyHint : ""}</td></tr>`;
    } else {
      const allT = S.teams(athletes, cat, event, teamSize), ts = f ? allT.filter((t) => matchTeam(t, f)) : allT;
      count = { shown: ts.length, total: allT.length };
      tbody = ts.length
        ? ts.map((t) => t.mem.map((r, i) => {
            const inTeam = t.counted.includes(r);
            const tt = i === 0
              ? `<td class="tt">T.${S.fmtT(t.total, e.mode)}${e.mode === "int" ? `<span class="x">-${t.x}X</span>` : ""}</td>`
              : "<td></td>";
            return row(r, i === 0 ? (t.total ? t.rank : "–") : "", tt, (i === 0 ? "teamstart " : "") + (inTeam || !r.st.any ? "" : "out"));
          }).join("")).join("")
        : `<tr><td colspan="${cols}" class="empty">${f && allT.length ? L("ไม่พบทีมที่ตรงกับตัวกรอง", "No teams match the filter") : L("ยังไม่มีทีม — ระบุสังกัดให้นักกีฬา ระบบจะรวมทีมให้อัตโนมัติ", "No teams yet — give athletes a team/university and teams are formed automatically")}</td></tr>`;
    }
    const size = teamSize || 3;
    return {
      title: L(`${th} / ${en}`, en),
      info: `${evName(event)} · ${e.mode === "dec" ? L("ทศนิยม", "decimal") : L("เต็มหน่วย + X", "integer + X")}${kind === "team" ? L(` · นับ ${size} คนที่ดีที่สุด`, ` · best ${size} count`) : ""}`,
      thead, tbody, count
    };
  }

  /* Paint into {title, info, thead, tbody} elements. */
  function paint(els, opts) {
    const h = boardHTML(opts);
    if (els.title) els.title.textContent = h.title;
    if (els.info) els.info.textContent = h.info;
    els.thead.innerHTML = h.thead;
    els.tbody.innerHTML = h.tbody;
    return h;
  }

  function setLive(dotEl, textEl, status, msg) {
    const live = status === "live";
    dotEl.classList.toggle("live", live);
    dotEl.classList.toggle("bad", status === "offline" || status === "error");
    textEl.textContent = live ? "LIVE"
      : status === "connecting" ? L("กำลังเชื่อมต่อ…", "Connecting…")
      : status === "offline" ? L("OFFLINE · กำลังเชื่อมต่อใหม่", "OFFLINE · reconnecting")
      : L("ผิดพลาด: ", "Error: ") + (msg || "");
  }

  function subline(comp) {
    if (!comp) return L("ISSF qualification scoring · ผลการแข่งขันสด", "ISSF qualification scoring · live results");
    return `${comp.name} · ${evName(comp.event)}`;
  }

  /* Athlete detail card: rank, totals, per-series totals; shot-by-shot only for series entered per shot. */
  function detailHTML(a, athletes, event) {
    const e = S.ev(event), n = S.nSer(event), st = S.stats(a, event), cat = a.cat || "W";
    const me = S.ranked(athletes, cat, event).find((r) => r.a.id === a.id);
    const rank = me && me.st.any ? me.rank : "–";
    const fmt = (t) => S.fmtT(t, e.mode);
    let shotsSeen = 0, tens = 0, xs = 0, sum = 0, best = null;
    let series = "";
    for (let k = 0; k < n; k++) {
      const s = st.ser[k], perShot = s.from === "shots";
      let body;
      if (perShot) {
        const chips = [];
        for (let j = 0; j < 10 && k * 10 + j < e.shots; j++) {
          const p = S.parseShot((a.shots || [])[k * 10 + j], e.mode);
          if (p) {
            shotsSeen++; sum += p.t; if (p.x) xs++;
            if (p.t >= 100) tens++;
            if (best === null || p.t > best) best = p.t;
            chips.push(`<span class="chip${p.x ? " x" : ""}">${esc(p.norm)}</span>`);
          } else chips.push(`<span class="chip empty">·</span>`);
        }
        body = `<div class="chips">${chips.join("")}</div>`;
      } else if (s.has) body = `<span class="muted">${L("กรอกเป็นคะแนนรวมชุด — ไม่มีข้อมูลรายนัด", "entered as a series total — no shot detail")}</span>`;
      else body = `<span class="muted">${L("ยังไม่ได้ยิง", "not shot yet")}</span>`;
      series += `<div class="dseries"><span class="lab">S${k + 1}</span><div class="dbody">${body}</div><span class="st">${s.has ? fmt(s.t) + (e.mode === "int" || s.x ? `<span class="x">-${s.x}x</span>` : "") : "·"}</span></div>`;
    }
    let extra = "";
    if (shotsSeen) {
      const avg = (sum / shotsSeen / 10).toFixed(2);
      extra = `<div class="dstats"><span>${L("นับ 10 ขึ้นไป", "10s")}: <b>${tens}</b></span>${e.mode === "int" ? `<span>X: <b>${xs}</b></span>` : ""}<span>${L("เฉลี่ยต่อนัด", "Average / shot")}: <b>${avg}</b></span><span>${L("ดีที่สุด", "Best")}: <b>${fmt(best)}</b></span><span class="muted">(${shotsSeen} ${L("นัดที่มีรายละเอียด", "shots with detail")})</span></div>`;
    } else if (st.any) {
      extra = `<p class="muted">${L("ผลของนักกีฬาคนนี้กรอกเป็นคะแนนรวมชุด จึงไม่มีรายละเอียดรายนัด", "This athlete's scores were entered as series totals, so there is no shot-by-shot detail.")}</p>`;
    }
    return `<div class="dhead"><div class="drank">${rank}</div><div><div class="dname">${esc(a.name)}</div>
      <div class="muted">${esc(a.uni || "")}${a.relay ? ` · ${L("ผลัด", "Relay")} ${esc(a.relay)}` : ""}${a.lane ? ` · ${L("ลู่", "Lane")} ${esc(a.lane)}` : ""}</div></div>
      <div class="dtotal">${st.any ? fmt(st.total) : "–"}${st.any && (e.mode === "int" || st.x) ? `<span class="x">-${st.x}X</span>` : ""}<small>${st.count}/${e.shots} ${L("นัด", "shots")}</small></div></div>
      <div class="dseries-box">${series}</div>${extra}`;
  }

  // "Updated 14:32:05" = time of the latest score change (newest updated_at); adds the date if it is not today.
  function updatedText(athletes) {
    let t = 0;
    for (const a of athletes) { const v = Date.parse(a.updated_at); if (v > t) t = v; }
    if (!t) return "";
    const d = new Date(t), loc = L("th-TH", "en-GB"), now = new Date();
    const time = d.toLocaleTimeString(loc, { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false });
    const today = d.toDateString() === now.toDateString();
    const day = today ? "" : d.toLocaleDateString(loc, { day: "numeric", month: "short" }) + " ";
    return L("อัปเดตล่าสุด ", "Updated ") + day + time;
  }

  // "Now shooting: Relay 2" (empty when no relay is marked)
  const nowText = (comp) => (comp && comp.current_relay ? L("● กำลังยิง: ผลัด ", "● Now shooting: Relay ") + comp.current_relay : "");

  /* Summary strip for the public page: athletes, finished, teams, leader (for the selected tab's category). */
  function statsHTML(athletes, event, tab) {
    const e = S.ev(event), [cat] = S.TABS[tab];
    const all = S.ranked(athletes, cat, event);
    if (!all.length) return "";
    const done = all.filter((r) => r.st.count === e.shots).length;
    const nTeams = S.teams(athletes, cat, event, 3).length;
    const lead = all.find((r) => r.st.any);
    const box = (v, th, en) => `<div class="stat"><b>${v}</b><span>${L(th, en)}</span></div>`;
    return box(all.length, "นักกีฬา", "Athletes")
      + box(`${done}/${all.length}`, "ยิงครบแล้ว", "Finished")
      + box(nTeams, "ทีม", "Teams")
      + (lead ? box(`${esc(lead.a.name)} · ${S.fmtT(lead.st.total, e.mode)}`, "อันดับ 1 ตอนนี้", "Leading now") : "");
  }

  const getParam = (k) => new URLSearchParams(location.search).get(k);
  window.Render = { esc, statsHTML, boardHTML, paint, tabsHTML, tabCounts, nextTab, podiumHTML, certificatesHTML, setLive, subline, getParam, evName, noActiveHTML, detailHTML, updatedText, nowText };
})();
