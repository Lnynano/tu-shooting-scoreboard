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

  function tabsHTML(tab, athletes) {
    return S.TABS.map(([cat, kind, th, en], i) => {
      const c = athletes.filter((a) => (a.cat || "W") === cat).length;
      return `<button type="button" data-t="${i}" aria-pressed="${tab === i}">${L(th, en)}<span class="c">${kind === "ind" ? c : ""}</span></button>`;
    }).join("");
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
    let thead = `<tr><th class="l">#</th><th class="l">${L("ผลัด<small>Relay</small>", "Relay")}</th><th class="l">${L("ลู่<small>Lane</small>", "Lane")}</th><th class="l">${L("สังกัด<small>Univ.</small>", "Team")}</th><th class="l">${L("ชื่อ<small>Name</small>", "Name")}</th>`;
    for (let i = 1; i <= n; i++) thead += `<th>S${i}</th>`;
    thead += `<th>${L("รวม<small>Total</small>", "Total")}</th>${kind === "team" ? `<th>${L("ทีม<small>Team</small>", "Team")}</th>` : `<th>${L("นัด<small>Shots</small>", "Shots")}</th>`}</tr>`;

    const row = (r, rankCell, extra, cls = "") => `<tr class="row ${opts.clickable ? "click " : ""}${cls} ${r.a.id === opts.selectedId ? "sel" : ""}" data-id="${esc(r.a.id)}"${opts.clickable ? ' tabindex="0"' : ""}>
      <td class="rank">${rankCell}</td><td class="l">${esc(r.a.relay || "")}</td><td class="l">${esc(r.a.lane || "")}</td>
      <td class="uni">${esc(r.a.uni || "")}</td>
      <td class="name">${esc(r.a.name)}${r.st.count === e.shots ? `<span class="pill done">${L("ครบ", "Done")}</span>` : ""}</td>
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

  const getParam = (k) => new URLSearchParams(location.search).get(k);
  window.Render = { esc, boardHTML, paint, tabsHTML, setLive, subline, getParam, evName, noActiveHTML, updatedText };
})();
