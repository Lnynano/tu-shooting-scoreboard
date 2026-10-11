/* Staff page: login, staff check, competitions, athletes, score entry, import, CSV. */
(function () {
  "use strict";
  const sb = TU.sb, S = Scoring, esc = Render.esc;
  const $ = (id) => document.getElementById(id);
  const UKEY = "tu-staff-ui-v1";

  let UI = { tab: 0, sel: null, entry: "series", comp: null };
  try { Object.assign(UI, JSON.parse(localStorage.getItem(UKEY)) || {}); } catch (e) {}
  const saveUI = () => { try { localStorage.setItem(UKEY, JSON.stringify(UI)); } catch (e) {} };

  let comps = [], W = null, userId = null, appRunning = false;
  const dirty = new Set(), ver = new Map(), timers = new Map(), chains = new Map();
  let inflight = 0, lastOk = 0, errMsg = "";

  /* ---------- helpers ---------- */
  const state = () => (W ? W.state : null);
  const comp = () => (state() && state().comp) || null;
  const athletes = () => (state() ? state().athletes : new Map());
  const evKey = () => (comp() ? comp().event : "ap60");
  const ev = () => S.ev(evKey());
  const teamSize = () => (comp() ? comp().team_size : 3);

  function view(name) {
    for (const v of ["loadingView", "authView", "deniedView", "appView"]) $(v).hidden = v !== name;
    $("userBox").hidden = name !== "appView" && name !== "deniedView";
  }
  function showNotice(msg) {
    const n = $("notice");
    n.hidden = !msg;
    n.innerHTML = msg ? `<div class="notice err">${esc(msg)}</div>` : "";
  }
  function confirmUI(box, msg, yes, fn) {
    box.hidden = false;
    box.innerHTML = `<div class="confirm"><span>${msg}</span><button type="button" class="primary" data-a="y">${yes}</button><button type="button" data-a="n">ยกเลิก</button></div>`;
    box.querySelector('[data-a="y"]').onclick = () => { box.hidden = true; box.innerHTML = ""; fn(); };
    box.querySelector('[data-a="n"]').onclick = () => { box.hidden = true; box.innerHTML = ""; };
  }

  /* ---------- save status ---------- */
  function setSave() {
    const el = $("saveStatus");
    el.className = "save";
    if (errMsg) {
      el.classList.add("err");
      el.textContent = "✕ บันทึกไม่สำเร็จ: " + errMsg;
    } else if (inflight) {
      el.textContent = "กำลังบันทึก…";
    } else if (dirty.size) {
      el.textContent = "รอบันทึก…";
    } else if (lastOk) {
      el.classList.add("ok");
      el.textContent = "✓ บันทึกแล้ว " + new Date(lastOk).toLocaleTimeString("th-TH");
    } else el.textContent = "";
    $("retryBtn").hidden = !(errMsg && dirty.size);
  }
  // Wrap one write. Supabase returns {error}; RLS-denied updates return no error but no rows.
  async function run(fn) {
    inflight++; setSave();
    try {
      const res = await fn();
      if (res && res.error) throw res.error;
      lastOk = Date.now(); errMsg = "";
      return res || {};
    } catch (e) {
      errMsg = (e && e.message) || String(e);
      return null;
    } finally { inflight--; setSave(); }
  }
  window.addEventListener("beforeunload", (e) => { if (dirty.size || inflight) { e.preventDefault(); e.returnValue = ""; } });

  /* ---------- athlete saves (debounced per athlete) ---------- */
  const fill = (arr) => { const src = arr || [], out = Array.from({ length: src.length }, (_, i) => src[i] || ""); while (out.length && out[out.length - 1] === "") out.pop(); return out; };
  const payload = (a) => ({ name: a.name, uni: a.uni || "", cat: a.cat || "W", relay: a.relay || "", lane: a.lane || "", shots: fill(a.shots), ser: fill(a.ser) });

  function queueSave(id, delay = 400) {
    dirty.add(id);
    ver.set(id, (ver.get(id) || 0) + 1);
    clearTimeout(timers.get(id));
    timers.set(id, setTimeout(() => flush(id), delay));
    setSave();
  }
  function flush(id) {
    clearTimeout(timers.get(id));
    const prev = chains.get(id) || Promise.resolve();
    const p = prev.then(async () => {
      const a = athletes().get(id);
      if (!a) { dirty.delete(id); return; }
      const v = ver.get(id);
      const res = await run(() => sb.from("athletes").update(payload(a)).eq("id", id).select("id"));
      if (res && !res.data.length) { errMsg = "ไม่พบแถวหรือไม่มีสิทธิ์แก้ไข (RLS)"; setSave(); return; }
      if (res && ver.get(id) === v) dirty.delete(id);
    }).finally(() => { if (chains.get(id) === p) chains.delete(id); setSave(); });
    chains.set(id, p);
    return p;
  }
  const flushAll = () => Promise.all([...dirty].map(flush));
  $("retryBtn").onclick = () => { errMsg = ""; flushAll(); };

  /* ---------- auth ---------- */
  $("loginForm").addEventListener("submit", async (f) => {
    f.preventDefault();
    $("loginBtn").disabled = true; $("loginErr").hidden = true;
    const { error } = await sb.auth.signInWithPassword({ email: $("email").value.trim(), password: $("password").value });
    $("loginBtn").disabled = false;
    if (error) {
      $("loginErr").hidden = false;
      $("loginErr").textContent = /invalid/i.test(error.message) ? "อีเมลหรือรหัสผ่านไม่ถูกต้อง" : "เข้าสู่ระบบไม่ได้: " + error.message;
    } else $("password").value = "";
  });
  async function logout() {
    try { await flushAll(); } catch (e) {}
    stopApp();
    await sb.auth.signOut();
  }
  $("logoutBtn").onclick = logout;
  $("deniedLogout").onclick = logout;

  async function route(session) {
    if (!session) { userId = null; stopApp(); view("authView"); return; }
    if (appRunning && session.user.id === userId) return; // token refresh
    userId = session.user.id;
    $("userEmail").textContent = session.user.email || "";
    view("loadingView");
    const { data, error } = await sb.from("staff").select("user_id").eq("user_id", userId).maybeSingle();
    if (error) {
      $("deniedMsg").textContent = "ตรวจสอบสิทธิ์ไม่ได้: " + error.message;
      view("deniedView"); return;
    }
    if (!data) {
      $("deniedMsg").textContent = "บัญชีนี้ไม่มีสิทธิ์กรอกคะแนน";
      view("deniedView"); return;
    }
    view("appView");
    startApp();
  }
  // Do not await supabase calls inside this callback (auth lock); defer.
  sb.auth.onAuthStateChange((evt, session) => { setTimeout(() => route(session), 0); });

  /* ---------- app lifecycle ---------- */
  let compPoll = null;
  async function loadComps() {
    try { comps = await TU.listCompetitions(); renderCompSel(); } catch (e) { showNotice("โหลดรายการแข่งขันไม่ได้: " + e.message); }
  }
  async function startApp() {
    appRunning = true;
    await loadComps();
    compPoll = setInterval(loadComps, 30000);
    const pick = comps.find((c) => c.id === UI.comp) || comps.find((c) => c.is_active) || comps[0];
    if (pick) selectComp(pick.id); else renderAll();
  }
  function stopApp() {
    appRunning = false;
    clearInterval(compPoll);
    if (W) { W.stop(); W = null; }
    comps = []; dirty.clear(); UI.sel = null;
  }
  function selectComp(id) {
    if (W) W.stop();
    UI.comp = id; UI.sel = null; saveUI();
    W = TU.watch({
      id,
      skip: (aid) => dirty.has(aid),
      onChange: onData,
      onStatus: (s, m) => Render.setLive($("liveDot"), $("liveText"), s, m)
    });
    renderAll();
  }
  function onData(s) {
    const c = s.comp;
    if (c) { const i = comps.findIndex((x) => x.id === c.id); if (i >= 0) comps[i] = c; else comps.unshift(c); }
    if (UI.sel && !s.athletes.has(UI.sel)) UI.sel = null;
    renderCompSel(); renderMeta(); renderTabs(); renderBoard();
    if (!$("card").contains(document.activeElement)) renderCard(); else updateCardTotals();
  }

  /* ---------- competitions ---------- */
  function renderCompSel() {
    const sel = $("compSel");
    sel.innerHTML = comps.length
      ? comps.map((c) => `<option value="${esc(c.id)}">${c.is_active ? "★ " : ""}${esc(c.name)}</option>`).join("")
      : `<option value="">— ยังไม่มีการแข่งขัน —</option>`;
    if (UI.comp) sel.value = UI.comp;
  }
  function renderMeta() {
    const c = comp();
    for (const id of ["compName", "event", "teamSize", "activeBtn", "importBtn", "copyBtn"]) $(id).disabled = !c;
    $("addForm").hidden = !c;
    if (!c) { $("subline").textContent = "สร้างการแข่งขันก่อน · Create a competition to begin"; $("links").innerHTML = ""; $("activeBadge").hidden = true; return; }
    $("event").value = c.event;
    $("teamSize").value = String(Math.min(4, Math.max(2, c.team_size)));
    if (document.activeElement !== $("compName")) $("compName").value = c.name;
    $("subline").textContent = `${c.name} · ${ev().name}`;
    $("activeBtn").hidden = c.is_active;
    $("activeBadge").hidden = !c.is_active;
    $("links").innerHTML = `<a href="index.html?c=${esc(c.id)}" target="_blank" rel="noopener">หน้าสาธารณะ</a> · <a href="board.html?c=${esc(c.id)}" target="_blank" rel="noopener">จอใหญ่</a>`;
  }
  async function patchComp(patch) {
    const c = comp(); if (!c) return;
    Object.assign(c, patch);
    const res = await run(() => sb.from("competitions").update(patch).eq("id", c.id).select("id"));
    if (res && !res.data.length) { errMsg = "ไม่มีสิทธิ์แก้ไขการแข่งขัน (RLS)"; setSave(); }
    loadComps();
  }
  $("compSel").addEventListener("change", () => { if ($("compSel").value) selectComp($("compSel").value); });
  $("newCompBtn").onclick = async () => {
    const res = await run(() => sb.from("competitions").insert({}).select("*").single());
    if (!res) return;
    comps.unshift(res.data); renderCompSel(); selectComp(res.data.id);
    $("compName").focus(); $("compName").select();
  };
  let nameTimer = null;
  $("compName").addEventListener("input", () => {
    clearTimeout(nameTimer);
    const v = $("compName").value.trim();
    nameTimer = setTimeout(() => { if (v) patchComp({ name: v }); }, 400);
    if (comp() && v) { comp().name = v; $("subline").textContent = `${v} · ${ev().name}`; renderCompSel(); }
  });
  $("teamSize").addEventListener("change", () => { patchComp({ team_size: +$("teamSize").value }); renderBoard(); });
  $("activeBtn").onclick = async () => {
    const c = comp(); if (!c) return;
    const res = await run(() => sb.rpc("set_active_competition", { cid: c.id }));
    await loadComps();
    const now = comps.find((x) => x.id === c.id);
    if (res && now && !now.is_active) { errMsg = "ตั้งเป็นรายการที่แสดงไม่สำเร็จ (ไม่มีสิทธิ์?)"; setSave(); }
    else if (now) { c.is_active = true; }
    renderMeta();
  };

  $("event").innerHTML = Object.entries(S.EVENTS).map(([k, v]) => `<option value="${k}">${v.name}</option>`).join("");
  $("event").addEventListener("change", () => {
    const c = comp(); if (!c) return;
    const nk = $("event").value, old = c.event, same = S.EVENTS[nk].mode === S.EVENTS[old].mode;
    const has = [...athletes().values()].some((a) => (a.shots || []).some(Boolean) || (a.ser || []).some(Boolean));
    const apply = async () => {
      await patchComp({ event: nk });
      if (!same && has) {
        for (const a of athletes().values()) { a.shots = []; a.ser = []; }
        await run(() => sb.from("athletes").update({ shots: [], ser: [] }).eq("competition_id", c.id));
      }
      renderAll();
    };
    if (has && !same) {
      $("event").value = old;
      confirmUI($("confirmBox"), "รายการนี้ใช้ระบบคะแนนต่างกัน — เปลี่ยนแล้วคะแนนทั้งหมดจะถูกล้าง (รายชื่อยังอยู่)", "เปลี่ยนและล้างคะแนน", () => { $("event").value = nk; apply(); });
    } else apply();
  });

  /* ---------- board ---------- */
  function renderTabs() { $("tabs").innerHTML = Render.tabsHTML(UI.tab, [...athletes().values()]); }
  function renderBoard() {
    const s = state();
    Render.paint(
      { title: $("boardTitle"), info: $("evInfo"), thead: $("thead"), tbody: $("tbody") },
      { athletes: [...athletes().values()], event: evKey(), teamSize: teamSize(), tab: UI.tab, selectedId: UI.sel, clickable: true,
        loading: W && !(s && s.loaded),
        emptyHint: comp() ? "เพิ่มชื่อด้านล่าง หรือกด <b>วางจาก Excel</b> เพื่อนำเข้าทั้งรายชื่อ" : "" });
    if (!comp() && !(W && !(s && s.loaded))) $("tbody").innerHTML = `<tr><td colspan="20" class="empty">ยังไม่มีการแข่งขัน — กด “+ สร้างการแข่งขัน”</td></tr>`;
  }
  function renderAll() { renderCompSel(); renderMeta(); renderTabs(); renderBoard(); renderCard(); setSave(); }
  $("tabs").addEventListener("click", (c) => { const b = c.target.closest("[data-t]"); if (b) { UI.tab = +b.dataset.t; saveUI(); renderTabs(); renderBoard(); } });
  function select(id) {
    UI.sel = id; saveUI(); renderBoard(); renderCard();
    const first = $("card").querySelector(".serin:not([value]),.serin[value=''],.shots input[value='']") || $("card").querySelector(".serin,.shots input");
    if (first && window.innerWidth > 980) first.focus({ preventScroll: true });
  }
  $("tbody").addEventListener("click", (c) => { const tr = c.target.closest("tr[data-id]"); if (tr) select(tr.dataset.id); });
  $("tbody").addEventListener("keydown", (k) => { if (k.key === "Enter") { const tr = k.target.closest("tr[data-id]"); if (tr) select(tr.dataset.id); } });

  /* ---------- score card ---------- */
  const card = $("card");
  function renderCard() {
    const e = ev(), a = athletes().get(UI.sel), n = S.nSer(evKey());
    if (!a) { card.innerHTML = `<p class="empty">เลือกนักกีฬาจากตารางเพื่อบันทึกคะแนน</p>`; $("hint").textContent = ""; return; }
    const st = S.stats(a, evKey());
    let h = `<div class="fields">
      <label class="f" for="fName" style="grid-column:1/-1">ชื่อ / Name<input type="text" id="fName" data-k="name" value="${esc(a.name)}"></label>
      <label class="f" for="fUni">สังกัด / Team<input type="text" id="fUni" data-k="uni" value="${esc(a.uni || "")}"></label>
      <label class="f" for="fCat">ประเภท<select id="fCat" data-k="cat"><option value="W"${(a.cat || "W") === "W" ? " selected" : ""}>หญิง / W</option><option value="M"${a.cat === "M" ? " selected" : ""}>ชาย / M</option></select></label>
      <label class="f" for="fRelay">ผลัด / Relay<input type="text" id="fRelay" data-k="relay" value="${esc(a.relay || "")}"></label>
      <label class="f" for="fLane">เลน / Lane<input type="text" id="fLane" data-k="lane" value="${esc(a.lane || "")}"></label>
    </div>
    <div class="cardtop"><div class="big" id="bigTotal"></div>
      <div class="seg" role="group" aria-label="Entry mode"><button type="button" data-m="series" aria-pressed="${UI.entry === "series"}">รวมชุด</button><button type="button" data-m="shot" aria-pressed="${UI.entry === "shot"}">ทีละนัด</button></div></div>`;
    for (let k = 0; k < n; k++) {
      h += `<div class="series"><span class="lab">S${k + 1}</span>`;
      if (UI.entry === "shot") {
        h += `<div class="shots">`;
        for (let j = 0; j < 10; j++) {
          const i = k * 10 + j; if (i >= e.shots) break;
          const raw = (a.shots || [])[i] || "", p = S.parseShot(raw, e.mode);
          h += `<input type="text" id="shot-${i}" data-i="${i}" value="${esc(raw)}" inputmode="${e.mode === "dec" ? "decimal" : "text"}" autocomplete="off" aria-label="S${k + 1} shot ${j + 1}" class="${p && p.x ? "x" : ""}"${p === false ? ' aria-invalid="true"' : ""}>`;
        }
        h += `</div>`;
      } else if (S.serHas(a, k)) {
        h += `<span class="locked">กรอกทีละนัดไว้แล้ว — สลับเป็น “ทีละนัด” เพื่อแก้</span>`;
      } else {
        const raw = (a.ser || [])[k] || "", p = S.parseSeries(raw, e.mode);
        h += `<input type="text" class="serin" id="ser-${k}" data-k2="${k}" value="${esc(raw)}" placeholder="${e.mode === "int" ? "เช่น 89-1x" : "เช่น 102.4"}" autocomplete="off" aria-label="Series ${k + 1} total"${p === false ? ' aria-invalid="true"' : ""}>`;
      }
      h += `<span class="st" id="st-${k}"></span></div>`;
    }
    h += `<div class="rowbtns"><button type="button" id="delBtn" class="ghost">ลบนักกีฬา</button></div><div id="cardConfirm"></div>`;
    card.innerHTML = h;
    updateCardTotals(st);
    $("hint").textContent = UI.entry === "series"
      ? (e.mode === "int" ? "พิมพ์คะแนนรวมชุดกับจำนวน X เช่น 89-1x หรือ 89 แล้วกด Enter" : "พิมพ์คะแนนรวมชุดทศนิยม เช่น 102.4 แล้วกด Enter")
      : (e.mode === "int" ? "พิมพ์ 0–10 หรือ X ทีละนัด ระบบเลื่อนช่องให้อัตโนมัติ · Backspace ในช่องว่างเพื่อย้อนกลับ" : "พิมพ์ 0.0–10.9 ทีละนัด ระบบเลื่อนช่องให้อัตโนมัติ · Backspace ในช่องว่างเพื่อย้อนกลับ");
    $("delBtn").onclick = () => confirmUI($("cardConfirm"), `ลบ “${esc(a.name)}” และคะแนนทั้งหมด?`, "ลบ", async () => {
      const id = UI.sel; UI.sel = null; saveUI();
      clearTimeout(timers.get(id)); dirty.delete(id);
      athletes().delete(id);
      renderAll();
      const res = await run(() => sb.from("athletes").delete().eq("id", id).select("id"));
      if (res && !res.data.length) { errMsg = "ลบไม่สำเร็จ (ไม่พบแถวหรือไม่มีสิทธิ์)"; setSave(); }
      if (W) W.refresh();
    });
  }
  function updateCardTotals(st) {
    const e = ev(), a = athletes().get(UI.sel);
    if (!a || !$("bigTotal")) return;
    st = st || S.stats(a, evKey());
    $("bigTotal").innerHTML = `${S.fmtT(st.total, e.mode)}${e.mode === "int" || st.x ? `<span class="x">${st.x}X</span>` : ""}<small>${st.count}/${e.shots} นัด</small>`;
    st.ser.forEach((s, k) => { const el = $("st-" + k); if (el) el.innerHTML = s.has ? S.fmtT(s.t, e.mode) + (e.mode === "int" || s.x ? `<span class="x">-${s.x}x</span>` : "") : "·"; });
  }
  function refreshLive() { renderTabs(); renderBoard(); updateCardTotals(); }

  function commitShot(inp) {
    const e = ev(), a = athletes().get(UI.sel); if (!a) return false;
    const i = +inp.dataset.i, p = S.parseShot(inp.value, e.mode);
    if (p === false) { inp.setAttribute("aria-invalid", "true"); return false; }
    inp.removeAttribute("aria-invalid");
    if (p && p.norm !== inp.value) inp.value = p.norm;
    inp.classList.toggle("x", !!(p && p.x));
    a.shots = a.shots || [];
    const nv = p ? p.norm : "";
    if ((a.shots[i] || "") !== nv) { a.shots[i] = nv; queueSave(UI.sel); }
    refreshLive(); return true;
  }
  function commitSer(inp) {
    const e = ev(), a = athletes().get(UI.sel); if (!a) return false;
    const k = +inp.dataset.k2, p = S.parseSeries(inp.value, e.mode);
    if (p === false) { inp.setAttribute("aria-invalid", "true"); return false; }
    inp.removeAttribute("aria-invalid");
    if (p && p.norm !== inp.value) inp.value = p.norm;
    a.ser = a.ser || [];
    const nv = p ? p.norm : "";
    if ((a.ser[k] || "") !== nv) { a.ser[k] = nv; queueSave(UI.sel); }
    refreshLive(); return true;
  }
  card.addEventListener("input", (x) => {
    const t = x.target, a = athletes().get(UI.sel); if (!a) return;
    if (t.dataset.k) {
      if (t.dataset.k === "name" && !t.value.trim()) { t.setAttribute("aria-invalid", "true"); return; }
      t.removeAttribute("aria-invalid");
      a[t.dataset.k] = t.value; queueSave(UI.sel); renderTabs(); renderBoard(); return;
    }
    if (t.dataset.i) {
      const v = t.value.trim();
      const done = ev().mode === "int" ? /^([xX]|10|[2-9])$/.test(v) : /^(10\.\d|[0-9]\.\d)$/.test(v);
      if (done && commitShot(t)) { const nx = $("shot-" + (+t.dataset.i + 1)); if (nx) { nx.focus(); nx.select(); } }
    }
  });
  card.addEventListener("change", (x) => {
    const t = x.target;
    if (t.dataset.k === "cat") { athletes().get(UI.sel).cat = t.value; queueSave(UI.sel, 0); renderTabs(); renderBoard(); }
  });
  card.addEventListener("keydown", (k) => {
    const t = k.target;
    if (t.dataset.i) {
      const i = +t.dataset.i;
      if (k.key === "Enter") { k.preventDefault(); if (commitShot(t)) { const nx = $("shot-" + (i + 1)); if (nx) { nx.focus(); nx.select(); } } }
      else if (k.key === "Backspace" && t.value === "" && i > 0) { k.preventDefault(); const pv = $("shot-" + (i - 1)); pv.focus(); pv.select(); }
    }
    if (t.dataset.k2 !== undefined && k.key === "Enter") {
      k.preventDefault();
      if (commitSer(t)) { const nx = $("ser-" + (+t.dataset.k2 + 1)); if (nx) { nx.focus(); nx.select(); } else t.blur(); }
    }
  });
  card.addEventListener("focusout", (f) => {
    const t = f.target;
    if (t.dataset && t.dataset.i) commitShot(t); else if (t.dataset && t.dataset.k2 !== undefined) commitSer(t);
  });
  card.addEventListener("click", (c) => { const b = c.target.closest("[data-m]"); if (b) { UI.entry = b.dataset.m; saveUI(); renderCard(); } });

  /* ---------- add athlete ---------- */
  $("addForm").addEventListener("submit", async (f) => {
    f.preventDefault();
    const c = comp(), name = $("newName").value.trim();
    if (!c || !name) return;
    const row = { competition_id: c.id, name, uni: $("newUni").value.trim(), cat: S.TABS[UI.tab][0], relay: "", lane: "" };
    const res = await run(() => sb.from("athletes").insert(row).select("*").single());
    if (!res) return;
    athletes().set(res.data.id, res.data);
    $("newName").value = ""; $("newUni").value = "";
    renderTabs(); select(res.data.id);
  });

  /* ---------- import ---------- */
  $("importBtn").onclick = () => {
    const p = $("importPanel");
    p.hidden = !p.hidden; if (p.hidden) return;
    p.innerHTML = `<h2>วางข้อมูลจาก Excel / Google Sheets <small>คัดลอกทั้งตารางแล้ววางด้านล่าง (แถวหัวตารางจะถูกข้ามอัตโนมัติ)</small></h2>
    <p class="rules">ลำดับคอลัมน์: <b>ชื่อ · สังกัด · ประเภท (W/M หรือ หญิง/ชาย) · ผลัด · เลน · S1 · S2 · …</b> — คอลัมน์ S เว้นว่างได้ ใส่ได้ทั้ง <code>89-1x</code> หรือ <code>89</code></p>
    <pre>ชื่อ\tสังกัด\tประเภท\tผลัด\tเลน\tS1\tS2
นางสาวสมหญิง ใจดี\tTU\tW\t1\t3\t89-1x\t87-0x
นายสมชาย ยิงตรง\tTU\tM\t1\t4</pre>
    <textarea id="impText" rows="7" aria-label="Pasted rows"></textarea>
    <div class="rowbtns"><button type="button" class="primary" id="impGo">นำเข้า</button><button type="button" class="ghost" id="impClose">ปิด</button><span class="meta" id="impMsg"></span></div>`;
    $("impClose").onclick = () => { p.hidden = true; };
    $("impText").addEventListener("input", () => {
      const r = S.parseImport($("impText").value, evKey());
      $("impMsg").textContent = r.rows.length ? `พบ ${r.rows.length} คน${r.bad ? ` · ค่าคะแนนอ่านไม่ได้ ${r.bad} ช่อง (จะเว้นว่าง)` : ""}` : "";
    });
    $("impGo").onclick = async () => {
      const c = comp(), r = S.parseImport($("impText").value, evKey());
      if (!r.rows.length) { $("impMsg").textContent = "ไม่พบข้อมูล — วางจากตารางที่มีคอลัมน์ชื่อก่อน"; return; }
      $("impGo").disabled = true;
      let done = 0;
      for (let i = 0; i < r.rows.length; i += 100) {
        const chunk = r.rows.slice(i, i + 100).map((x) => ({ ...x, competition_id: c.id }));
        const res = await run(() => sb.from("athletes").insert(chunk).select("*"));
        if (!res) { $("impMsg").textContent = `นำเข้าไม่สำเร็จ (นำเข้าแล้ว ${done}/${r.rows.length}) — ดูข้อความผิดพลาดด้านบน`; $("impGo").disabled = false; if (W) W.refresh(); return; }
        res.data.forEach((row) => athletes().set(row.id, row));
        done += chunk.length;
        $("impMsg").textContent = `นำเข้าแล้ว ${done}/${r.rows.length}`;
      }
      $("impGo").disabled = false; $("impText").value = "";
      renderTabs(); renderBoard();
    };
  };

  /* ---------- CSV ---------- */
  $("copyBtn").onclick = async () => {
    const c = comp(); if (!c) return;
    const csv = S.toCSV([...athletes().values()], c.event, c.team_size, c.name);
    try {
      await navigator.clipboard.writeText(csv);
      $("saveStatus").className = "save ok"; $("saveStatus").textContent = "✓ คัดลอก CSV แล้ว — วางใน Google Sheets ได้เลย";
      setTimeout(setSave, 4000);
    } catch (err) {
      const box = $("confirmBox"); box.hidden = false;
      box.innerHTML = `<div class="confirm" style="flex-direction:column;align-items:stretch"><span>คัดลอกอัตโนมัติไม่ได้ — เลือกข้อความแล้วกด Ctrl+C</span><textarea id="csvOut" rows="6" style="font-family:var(--mono);font-size:.8rem;width:100%">${esc(csv)}</textarea><button type="button" id="csvClose">ปิด</button></div>`;
      $("csvOut").select(); $("csvClose").onclick = () => { box.hidden = true; box.innerHTML = ""; };
    }
  };

  view("loadingView");
})();
