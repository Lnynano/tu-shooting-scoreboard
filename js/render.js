/* Board table rendering shared by index.html, board.html and staff.html. Needs js/scoring.js. */
(function () {
  "use strict";
  const S = window.Scoring;
  const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

  function serCell(st, mode) {
    if (!st.has) return "·";
    return S.fmtT(st.t, mode) + (mode === "int" || st.x ? `<span class="x">-${st.x}x</span>` : "");
  }

  function tabsHTML(tab, athletes) {
    return S.TABS.map(([cat, kind, th], i) => {
      const c = athletes.filter((a) => (a.cat || "W") === cat).length;
      return `<button type="button" data-t="${i}" aria-pressed="${tab === i}">${th}<span class="c">${kind === "ind" ? c : ""}</span></button>`;
    }).join("");
  }

  /* opts: {athletes[], event, teamSize, tab, selectedId, clickable, loading, emptyHint}
     returns {title, info, thead, tbody} (HTML strings) */
  function boardHTML(opts) {
    const { athletes, event, teamSize, tab } = opts;
    const e = S.ev(event), n = S.nSer(event), [cat, kind, th, en] = S.TABS[tab];
    const cols = n + 7;
    let thead = `<tr><th class="l">#</th><th class="l">ผลัด<small>Relay</small></th><th class="l">เลน<small>Lane</small></th><th class="l">สังกัด<small>Univ.</small></th><th class="l">ชื่อ<small>Name</small></th>`;
    for (let i = 1; i <= n; i++) thead += `<th>S${i}</th>`;
    thead += `<th>รวม<small>Total</small></th>${kind === "team" ? "<th>ทีม<small>Team</small></th>" : "<th>นัด<small>Shots</small></th>"}</tr>`;

    const row = (r, rankCell, extra, cls = "") => `<tr class="row ${opts.clickable ? "click " : ""}${cls} ${r.a.id === opts.selectedId ? "sel" : ""}" data-id="${esc(r.a.id)}"${opts.clickable ? ' tabindex="0"' : ""}>
      <td class="rank">${rankCell}</td><td class="l">${esc(r.a.relay || "")}</td><td class="l">${esc(r.a.lane || "")}</td>
      <td class="uni">${esc(r.a.uni || "")}</td>
      <td class="name">${esc(r.a.name)}${r.st.count === e.shots ? '<span class="pill done">ครบ</span>' : ""}</td>
      ${r.st.ser.map((s) => `<td class="ser">${serCell(s, e.mode)}</td>`).join("")}
      <td class="total">${r.st.any ? S.fmtT(r.st.total, e.mode) + (e.mode === "int" || r.st.x ? `<span class="x">-${r.st.x}X</span>` : "") : "–"}</td>${extra}</tr>`;

    let tbody;
    if (opts.loading) {
      tbody = `<tr><td colspan="${cols}" class="empty">กำลังโหลดผลการแข่งขัน…</td></tr>`;
    } else if (kind === "ind") {
      const list = S.ranked(athletes, cat, event);
      tbody = list.length
        ? list.map((r) => row(r, r.st.any ? r.rank : "–", `<td>${r.st.count}/${e.shots}</td>`)).join("")
        : `<tr><td colspan="${cols}" class="empty">ยังไม่มีนักกีฬาในประเภทนี้${opts.emptyHint ? "<br>" + opts.emptyHint : ""}</td></tr>`;
    } else {
      const ts = S.teams(athletes, cat, event, teamSize);
      tbody = ts.length
        ? ts.map((t) => t.mem.map((r, i) => {
            const inTeam = t.counted.includes(r);
            const tt = i === 0
              ? `<td class="tt">T.${S.fmtT(t.total, e.mode)}${e.mode === "int" ? `<span class="x">-${t.x}X</span>` : ""}</td>`
              : "<td></td>";
            return row(r, i === 0 ? (t.total ? t.rank : "–") : "", tt, (i === 0 ? "teamstart " : "") + (inTeam || !r.st.any ? "" : "out"));
          }).join("")).join("")
        : `<tr><td colspan="${cols}" class="empty">ยังไม่มีทีม — ระบุสังกัดให้นักกีฬา ระบบจะรวมทีมให้อัตโนมัติ</td></tr>`;
    }
    return {
      title: `${th} / ${en}`,
      info: `${e.name} · ${e.mode === "dec" ? "ทศนิยม" : "เต็มหน่วย + X"}${kind === "team" ? ` · นับ ${teamSize || 3} คนที่ดีที่สุด` : ""}`,
      thead, tbody
    };
  }

  /* Paint into {title, info, thead, tbody} elements. */
  function paint(els, opts) {
    const h = boardHTML(opts);
    if (els.title) els.title.textContent = h.title;
    if (els.info) els.info.textContent = h.info;
    els.thead.innerHTML = h.thead;
    els.tbody.innerHTML = h.tbody;
  }

  function setLive(dotEl, textEl, status, msg) {
    const live = status === "live";
    dotEl.classList.toggle("live", live);
    dotEl.classList.toggle("bad", status === "offline" || status === "error");
    textEl.textContent = live ? "LIVE" : status === "connecting" ? "กำลังเชื่อมต่อ…" : status === "offline" ? "OFFLINE · กำลังเชื่อมต่อใหม่" : "ผิดพลาด: " + (msg || "");
  }

  function subline(comp) {
    if (!comp) return "ISSF qualification scoring · ผลการแข่งขันสด";
    return `${comp.name} · ${S.ev(comp.event).name}`;
  }

  const getParam = (k) => new URLSearchParams(location.search).get(k);
  window.Render = { esc, boardHTML, paint, tabsHTML, setLive, subline, getParam };
})();
