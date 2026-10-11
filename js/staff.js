/* Staff page: login, staff check, competitions, athletes, score entry, import, CSV. */
(function () {
  "use strict";
  const sb = TU.sb, S = Scoring, esc = Render.esc, L = I18n.L;
  const $ = (id) => document.getElementById(id);
  const UKEY = "tu-staff-ui-v1";

  let UI = { tab: 0, sel: null, entry: "series", comp: null };
  try { Object.assign(UI, JSON.parse(localStorage.getItem(UKEY)) || {}); } catch (e) {}
  const saveUI = () => { try { localStorage.setItem(UKEY, JSON.stringify(UI)); } catch (e) {} };

  let comps = [], W = null, userId = null, appRunning = false;
  // Edits are sent as small patches (only what changed) so two staff never overwrite each other's entries.
  // pending: not yet sent; sending: currently in flight. Both are {fields:{}, shots:{idx:v}, ser:{idx:v}} per athlete id.
  const pending = new Map(), sending = new Map(), timers = new Map(), chains = new Map();
  const dirtyCount = () => new Set([...pending.keys(), ...sending.keys()]).size;
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
    box.innerHTML = `<div class="confirm"><span>${msg}</span><button type="button" class="primary" data-a="y">${yes}</button><button type="button" data-a="n">${L("ยกเลิก", "Cancel")}</button></div>`;
    box.querySelector('[data-a="y"]').onclick = () => { box.hidden = true; box.innerHTML = ""; fn(); };
    box.querySelector('[data-a="n"]').onclick = () => { box.hidden = true; box.innerHTML = ""; };
  }

  /* ---------- save status ---------- */
  function setSave() {
    const el = $("saveStatus");
    el.className = "save";
    if (errMsg) {
      el.classList.add("err");
      el.textContent = L("✕ บันทึกไม่สำเร็จ: ", "✕ Save failed: ") + errMsg;
    } else if (inflight) {
      el.textContent = L("กำลังบันทึก…", "Saving…");
    } else if (dirtyCount()) {
      el.textContent = L("รอบันทึก…", "Pending…");
    } else if (lastOk) {
      el.classList.add("ok");
      el.textContent = L("✓ บันทึกแล้ว ", "✓ Saved ") + new Date(lastOk).toLocaleTimeString(L("th-TH", "en-GB"));
    } else el.textContent = "";
    $("retryBtn").hidden = !(errMsg && dirtyCount());
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
  window.addEventListener("beforeunload", (e) => { if (dirtyCount() || inflight) { e.preventDefault(); e.returnValue = ""; } });

  /* ---------- athlete saves (debounced per athlete, patch-based) ---------- */
  const emptyPatch = () => ({ fields: {}, shots: {}, ser: {} });
  const mergePatch = (base, add) => ({
    fields: { ...base.fields, ...add.fields }, shots: { ...base.shots, ...add.shots }, ser: { ...base.ser, ...add.ser }
  });
  // Put not-yet-confirmed local edits on top of a row from the server (used for realtime updates and save results).
  function overlay(row) {
    const o = { ...row, shots: Array.from(row.shots || [], (v) => v || ""), ser: Array.from(row.ser || [], (v) => v || "") };
    for (const patch of [sending.get(row.id), pending.get(row.id)]) {
      if (!patch) continue;
      Object.assign(o, patch.fields);
      for (const [i, v] of Object.entries(patch.shots)) { while (o.shots.length <= +i) o.shots.push(""); o.shots[+i] = v; }
      for (const [k, v] of Object.entries(patch.ser)) { while (o.ser.length <= +k) o.ser.push(""); o.ser[+k] = v; }
    }
    return o;
  }

  // part: {fields:{k:v}} | {shots:{i:v}} | {ser:{k:v}}
  function queueSave(id, part, delay = 400) {
    pending.set(id, mergePatch(pending.get(id) || emptyPatch(), { ...emptyPatch(), ...part }));
    clearTimeout(timers.get(id));
    timers.set(id, setTimeout(() => flush(id), delay));
    setSave();
  }
  function flush(id) {
    clearTimeout(timers.get(id));
    const prev = chains.get(id) || Promise.resolve();
    const p = prev.then(async () => {
      const patch = pending.get(id);
      if (!patch) return;
      pending.delete(id); sending.set(id, patch);
      const res = await run(() => sb.rpc("patch_athlete", { aid: id, fields: patch.fields, shot_patch: patch.shots, ser_patch: patch.ser }));
      sending.delete(id);
      if (!res) {
        if (/not found/i.test(errMsg)) { errMsg = L("นักกีฬานี้ถูกลบไปแล้วหรือไม่มีสิทธิ์แก้ไข", "This athlete was deleted or you have no permission"); return; }
        pending.set(id, mergePatch(patch, pending.get(id) || emptyPatch())); // keep for retry; newer edits win
        return;
      }
      if (res.data && athletes().has(id)) athletes().set(id, overlay(res.data)); // also picks up other staff's edits
    }).finally(() => { if (chains.get(id) === p) chains.delete(id); setSave(); });
    chains.set(id, p);
    return p;
  }
  const flushAll = () => Promise.all([...pending.keys()].map(flush));
  $("retryBtn").onclick = () => { errMsg = ""; flushAll(); };

  /* ---------- auth ---------- */
  let deniedErr = null;
  function paintDenied() {
    $("deniedMsg").textContent = deniedErr ? L("ตรวจสอบสิทธิ์ไม่ได้: ", "Could not verify access: ") + deniedErr : L("บัญชีนี้ไม่มีสิทธิ์กรอกคะแนน", "This account is not allowed to enter scores");
  }
  $("loginForm").addEventListener("submit", async (f) => {
    f.preventDefault();
    $("loginBtn").disabled = true; $("loginErr").hidden = true;
    const { error } = await sb.auth.signInWithPassword({ email: $("email").value.trim(), password: $("password").value });
    $("loginBtn").disabled = false;
    if (error) {
      $("loginErr").hidden = false;
      $("loginErr").textContent = /invalid/i.test(error.message) ? L("อีเมลหรือรหัสผ่านไม่ถูกต้อง", "Incorrect email or password") : L("เข้าสู่ระบบไม่ได้: ", "Could not sign in: ") + error.message;
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
      deniedErr = error.message; paintDenied();
      view("deniedView"); return;
    }
    if (!data) {
      deniedErr = null; paintDenied();
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
    try { comps = await TU.listCompetitions(); renderCompSel(); } catch (e) { showNotice(L("โหลดรายการแข่งขันไม่ได้: ", "Could not load competitions: ") + e.message); }
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
    closeHistory();
    if (W) { W.stop(); W = null; }
    comps = []; pending.clear(); sending.clear(); UI.sel = null;
  }
  function selectComp(id) {
    if (W) W.stop();
    closeHistory();
    UI.comp = id; UI.sel = null; saveUI();
    W = TU.watch({
      id,
      transform: overlay,
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
    if (!$("card").contains(document.activeElement) && !$("keypad").contains(document.activeElement)) renderCard(); else updateCardTotals();
  }

  /* ---------- competitions ---------- */
  function renderCompSel() {
    const sel = $("compSel");
    sel.innerHTML = comps.length
      ? comps.map((c) => `<option value="${esc(c.id)}">${c.is_active ? "★ " : ""}${esc(c.name)}</option>`).join("")
      : `<option value="">${L("— ยังไม่มีการแข่งขัน —", "— No competitions —")}</option>`;
    if (UI.comp) sel.value = UI.comp;
  }
  function renderMeta() {
    const c = comp();
    for (const id of ["compName", "event", "teamSize", "activeBtn", "delCompBtn", "importBtn", "copyBtn", "histBtn", "printBtn2"]) $(id).disabled = !c;
    $("addForm").hidden = !c;
    if (!c) { $("subline").textContent = L("สร้างการแข่งขันก่อน · Create a competition to begin", "Create a competition to begin"); $("links").innerHTML = ""; $("activeBadge").hidden = true; return; }
    $("event").value = c.event;
    $("teamSize").value = String(Math.min(4, Math.max(2, c.team_size)));
    if (document.activeElement !== $("compName")) $("compName").value = c.name;
    $("subline").textContent = `${c.name} · ${Render.evName(evKey())}`;
    $("activeBtn").hidden = c.is_active;
    $("activeBadge").hidden = !c.is_active;
    $("links").innerHTML = `<a href="index.html?c=${esc(c.id)}" target="_blank" rel="noopener">${L("หน้าสาธารณะ", "Public page")}</a> · <a href="board.html?c=${esc(c.id)}" target="_blank" rel="noopener">${L("จอใหญ่", "Projector")}</a>`;
  }
  async function patchComp(patch) {
    const c = comp(); if (!c) return;
    Object.assign(c, patch);
    const res = await run(() => sb.from("competitions").update(patch).eq("id", c.id).select("id"));
    if (res && !res.data.length) { errMsg = L("ไม่มีสิทธิ์แก้ไขการแข่งขัน (RLS)", "No permission to edit the competition (RLS)"); setSave(); }
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
    if (comp() && v) { comp().name = v; $("subline").textContent = `${v} · ${Render.evName(evKey())}`; renderCompSel(); }
  });
  $("teamSize").addEventListener("change", () => { patchComp({ team_size: +$("teamSize").value }); renderBoard(); });
  $("delCompBtn").onclick = () => {
    const c = comp(); if (!c) return;
    const n = athletes().size;
    confirmUI($("confirmBox"), L(`ลบการแข่งขัน “${esc(c.name)}” พร้อมนักกีฬา ${n} คนและคะแนนทั้งหมด? กู้คืนไม่ได้`, `Delete competition “${esc(c.name)}” with its ${n} athletes and all scores? This cannot be undone.`), L("ลบการแข่งขัน", "Delete competition"), async () => {
      const res = await run(() => sb.from("competitions").delete().eq("id", c.id).select("id"));
      if (res && !res.data.length) { errMsg = L("ลบไม่สำเร็จ (ไม่พบแถวหรือไม่มีสิทธิ์)", "Delete failed (row not found or no permission)"); setSave(); return; }
      if (!res) return;
      for (const id of [...pending.keys()]) { clearTimeout(timers.get(id)); pending.delete(id); }
      if (W) { W.stop(); W = null; }
      await loadComps();
      const next = comps.find((x) => x.is_active) || comps[0];
      UI.comp = null; UI.sel = null;
      if (next) selectComp(next.id); else renderAll();
    });
  };
  $("activeBtn").onclick = async () => {
    const c = comp(); if (!c) return;
    const res = await run(() => sb.rpc("set_active_competition", { cid: c.id }));
    await loadComps();
    const now = comps.find((x) => x.id === c.id);
    if (res && now && !now.is_active) { errMsg = L("ตั้งเป็นรายการที่แสดงไม่สำเร็จ (ไม่มีสิทธิ์?)", "Could not set as displayed (no permission?)"); setSave(); }
    else if (now) { c.is_active = true; }
    renderMeta();
  };

  function fillSelects() {
    const ek = $("event").value, tk = $("teamSize").value;
    $("event").innerHTML = Object.entries(S.EVENTS).map(([k, v]) => `<option value="${k}">${L(v.name, v.nameEn)}</option>`).join("");
    $("teamSize").innerHTML = [2, 3, 4].map((n) => `<option value="${n}">${L(`ดีที่สุด ${n} คน`, `Best ${n} count`)}</option>`).join("");
    if (ek) $("event").value = ek;
    if (tk) $("teamSize").value = tk;
  }
  fillSelects();
  $("event").addEventListener("change", () => {
    const c = comp(); if (!c) return;
    const nk = $("event").value, old = c.event, same = S.EVENTS[nk].mode === S.EVENTS[old].mode;
    const has = [...athletes().values()].some((a) => (a.shots || []).some(Boolean) || (a.ser || []).some(Boolean));
    const apply = async () => {
      await patchComp({ event: nk });
      if (!same && has) {
        for (const a of athletes().values()) { a.shots = []; a.ser = []; } pending.clear();
        await run(() => sb.from("athletes").update({ shots: [], ser: [] }).eq("competition_id", c.id));
      }
      renderAll();
    };
    if (has && !same) {
      $("event").value = old;
      confirmUI($("confirmBox"), L("รายการนี้ใช้ระบบคะแนนต่างกัน — เปลี่ยนแล้วคะแนนทั้งหมดจะถูกล้าง (รายชื่อยังอยู่)", "This event uses a different scoring system — changing it clears all scores (athletes stay)"), L("เปลี่ยนและล้างคะแนน", "Change and clear scores"), () => { $("event").value = nk; apply(); });
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
        emptyHint: comp() ? L("เพิ่มชื่อด้านล่าง หรือกด <b>วางจาก Excel</b> เพื่อนำเข้าทั้งรายชื่อ", "Add names below, or press <b>Paste from Excel</b> to import the whole list") : "" });
    if (!comp() && !(W && !(s && s.loaded))) $("tbody").innerHTML = `<tr><td colspan="20" class="empty">${L("ยังไม่มีการแข่งขัน — กด “+ สร้างการแข่งขัน”", "No competition yet — press “+ New competition”")}</td></tr>`;
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
    if (!a) { card.innerHTML = `<p class="empty">${L("เลือกนักกีฬาจากตารางเพื่อบันทึกคะแนน", "Select an athlete in the table to enter scores")}</p>`; $("hint").textContent = ""; renderKeypad(); return; }
    const kp = kpOn();
    const st = S.stats(a, evKey());
    let h = `<div class="fields">
      <label class="f" for="fName" style="grid-column:1/-1">${L("ชื่อ / Name", "Name")}<input type="text" id="fName" data-k="name" value="${esc(a.name)}"></label>
      <label class="f" for="fUni">${L("สังกัด / Team", "Team")}<input type="text" id="fUni" data-k="uni" value="${esc(a.uni || "")}"></label>
      <label class="f" for="fCat">${L("ประเภท", "Category")}<select id="fCat" data-k="cat"><option value="W"${(a.cat || "W") === "W" ? " selected" : ""}>${L("หญิง / W", "Women / W")}</option><option value="M"${a.cat === "M" ? " selected" : ""}>${L("ชาย / M", "Men / M")}</option></select></label>
      <label class="f" for="fRelay">${L("ผลัด / Relay", "Relay")}<input type="text" id="fRelay" data-k="relay" value="${esc(a.relay || "")}"></label>
      <label class="f" for="fLane">${L("ลู่ / Lane", "Lane")}<input type="text" id="fLane" data-k="lane" value="${esc(a.lane || "")}"></label>
    </div>
    <div class="cardtop"><div class="big" id="bigTotal"></div>
      <button type="button" id="kpBtn" class="ghost" aria-pressed="${kp}" title="${L("แป้นกดบนจอ", "On-screen keypad")}" aria-label="${L("แป้นกดบนจอ", "On-screen keypad")}">⌨</button><div class="seg" role="group" aria-label="Entry mode"><button type="button" data-m="series" aria-pressed="${UI.entry === "series"}">${L("รวมชุด", "Series total")}</button><button type="button" data-m="shot" aria-pressed="${UI.entry === "shot"}">${L("ทีละนัด", "Per shot")}</button></div></div>`;
    for (let k = 0; k < n; k++) {
      h += `<div class="series"><span class="lab">S${k + 1}</span>`;
      if (UI.entry === "shot") {
        h += `<div class="shots">`;
        for (let j = 0; j < 10; j++) {
          const i = k * 10 + j; if (i >= e.shots) break;
          const raw = (a.shots || [])[i] || "", p = S.parseShot(raw, e.mode);
          h += `<input type="text" id="shot-${i}" data-i="${i}" value="${esc(raw)}" inputmode="${kp ? "none" : e.mode === "dec" ? "decimal" : "text"}" autocomplete="off" aria-label="S${k + 1} shot ${j + 1}" class="${p && p.x ? "x" : ""}"${p === false ? ' aria-invalid="true"' : ""}>`;
        }
        h += `</div>`;
      } else if (S.serHas(a, k)) {
        h += `<span class="locked">${L("กรอกทีละนัดไว้แล้ว — สลับเป็น “ทีละนัด” เพื่อแก้", "Entered per shot — switch to “Per shot” to edit")}</span>`;
      } else {
        const raw = (a.ser || [])[k] || "", p = S.parseSeries(raw, e.mode);
        h += `<input type="text" class="serin" id="ser-${k}" data-k2="${k}" value="${esc(raw)}"${kp ? ' inputmode="none"' : ""} placeholder="${e.mode === "int" ? L("เช่น 89-1x", "e.g. 89-1x") : L("เช่น 102.4", "e.g. 102.4")}" autocomplete="off" aria-label="Series ${k + 1} total"${p === false ? ' aria-invalid="true"' : ""}>`;
      }
      h += `<span class="st" id="st-${k}"></span></div>`;
    }
    h += `<div class="rowbtns"><button type="button" id="delBtn" class="ghost">${L("ลบนักกีฬา", "Delete athlete")}</button></div><div id="cardConfirm"></div>`;
    card.innerHTML = h;
    updateCardTotals(st);
    renderKeypad();
    $("hint").textContent = UI.entry === "series"
      ? (e.mode === "int" ? L("พิมพ์คะแนนรวมชุดกับจำนวน X เช่น 89-1x หรือ 89 แล้วกด Enter", "Type the series total and X count, e.g. 89-1x or 89, then press Enter") : L("พิมพ์คะแนนรวมชุดทศนิยม เช่น 102.4 แล้วกด Enter", "Type the decimal series total, e.g. 102.4, then press Enter"))
      : (e.mode === "int" ? L("พิมพ์ 0–10 หรือ X ทีละนัด ระบบเลื่อนช่องให้อัตโนมัติ · Backspace ในช่องว่างเพื่อย้อนกลับ", "Type 0–10 or X per shot; focus advances automatically · Backspace in an empty box goes back") : L("พิมพ์ 0.0–10.9 ทีละนัด ระบบเลื่อนช่องให้อัตโนมัติ · Backspace ในช่องว่างเพื่อย้อนกลับ", "Type 0.0–10.9 per shot; focus advances automatically · Backspace in an empty box goes back"));
    $("delBtn").onclick = () => confirmUI($("cardConfirm"), L(`ลบ “${esc(a.name)}” และคะแนนทั้งหมด?`, `Delete “${esc(a.name)}” and all scores?`), L("ลบ", "Delete"), async () => {
      const id = UI.sel; UI.sel = null; saveUI();
      clearTimeout(timers.get(id)); pending.delete(id); sending.delete(id);
      athletes().delete(id);
      renderAll();
      const res = await run(() => sb.from("athletes").delete().eq("id", id).select("id"));
      if (res && !res.data.length) { errMsg = L("ลบไม่สำเร็จ (ไม่พบแถวหรือไม่มีสิทธิ์)", "Delete failed (row not found or no permission)"); setSave(); }
      if (W) W.refresh();
    });
  }
  function updateCardTotals(st) {
    const e = ev(), a = athletes().get(UI.sel);
    if (!a || !$("bigTotal")) return;
    st = st || S.stats(a, evKey());
    $("bigTotal").innerHTML = `${S.fmtT(st.total, e.mode)}${e.mode === "int" || st.x ? `<span class="x">${st.x}X</span>` : ""}<small>${st.count}/${e.shots} ${L("นัด", "shots")}</small>`;
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
    if ((a.shots[i] || "") !== nv) { a.shots[i] = nv; queueSave(UI.sel, { shots: { [i]: nv } }); }
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
    if ((a.ser[k] || "") !== nv) { a.ser[k] = nv; queueSave(UI.sel, { ser: { [k]: nv } }); }
    refreshLive(); return true;
  }
  card.addEventListener("input", (x) => {
    const t = x.target, a = athletes().get(UI.sel); if (!a) return;
    if (t.dataset.k) {
      if (t.dataset.k === "name" && !t.value.trim()) { t.setAttribute("aria-invalid", "true"); return; }
      t.removeAttribute("aria-invalid");
      a[t.dataset.k] = t.value; queueSave(UI.sel, { fields: { [t.dataset.k]: t.value } }); renderTabs(); renderBoard(); return;
    }
    if (t.dataset.i) {
      const v = t.value.trim();
      const done = ev().mode === "int" ? /^([xX]|10|[2-9])$/.test(v) : /^(10\.\d|[0-9]\.\d)$/.test(v);
      if (done && commitShot(t)) { const nx = $("shot-" + (+t.dataset.i + 1)); if (nx) { nx.focus(); nx.select(); } }
    }
  });
  card.addEventListener("change", (x) => {
    const t = x.target;
    if (t.dataset.k === "cat") { athletes().get(UI.sel).cat = t.value; queueSave(UI.sel, { fields: { cat: t.value } }, 0); renderTabs(); renderBoard(); }
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
  card.addEventListener("click", (c) => {
    const b = c.target.closest("[data-m]");
    if (b) { UI.entry = b.dataset.m; saveUI(); renderCard(); return; }
    if (c.target.closest("#kpBtn")) { UI.keypad = !kpOn(); saveUI(); renderCard(); }
  });

  /* ---------- on-screen keypad (phones / tablets) ---------- */
  // Pistol: one tap per shot (0-10, X). Rifle: whole number, then tenths. Series totals: digits - x . and Next.
  const coarse = !!(window.matchMedia && matchMedia("(pointer: coarse)").matches);
  function kpOn() { return UI.keypad === true || (UI.keypad == null && (coarse || window.innerWidth <= 700)); }
  let kpWhole = null, lastIn = null;
  const inputs = () => [...card.querySelectorAll(UI.entry === "shot" ? ".shots input" : ".serin")];
  function kpTarget() {
    const all = inputs();
    const ae = document.activeElement;
    let el = all.includes(ae) ? ae : lastIn && $(lastIn);   // the box that has focus wins
    if (!el || !card.contains(el) || !all.includes(el)) el = all.find((i) => !i.value) || all[0] || null;
    return el;
  }
  const nextOf = (el) => { const all = inputs(), i = all.indexOf(el); return i >= 0 ? all[i + 1] || null : null; };
  const prevOf = (el) => { const all = inputs(), i = all.indexOf(el); return i > 0 ? all[i - 1] : null; };
  card.addEventListener("focusin", (e) => {
    if (e.target.matches("input[data-i],input[data-k2]") && e.target.id !== lastIn) { lastIn = e.target.id; kpWhole = null; renderKeypad(); }
  });

  function renderKeypad() {
    const kp = $("keypad"), a = athletes().get(UI.sel), t = a && kpOn() ? kpTarget() : null;
    document.body.classList.toggle("has-kp", !!t);
    if (!t) { kp.hidden = true; kp.innerHTML = ""; return; }
    const e = ev(), isShot = t.dataset.i !== undefined, btn = (cls, k, label, extra = "") => `<button type="button" class="kp ${cls}" data-kp="${k}"${extra}>${label}</button>`;
    let keys = "", head = `${esc(t.getAttribute("aria-label") || "")}`;
    if (isShot && e.mode === "int") {
      keys = [..."0123456789"].map((d) => btn("", d, d)).join("") + btn("", "10", "10") + btn("kp-x", "X", "X") + btn("kp-w", "back", "⌫", ' aria-label="Backspace"');
    } else if (isShot) {
      if (kpWhole == null) {
        keys = Array.from({ length: 11 }, (_, d) => btn("", "w" + d, d)).join("") + btn("kp-w", "back", "⌫", ' aria-label="Backspace"');
      } else {
        head += ` · ${kpWhole}.`;
        keys = Array.from({ length: 10 }, (_, d) => btn("", "t" + d, "." + d)).join("") + btn("kp-w", "undo", "←", ' aria-label="Back"');
      }
    } else {
      const dec = e.mode === "dec";
      keys = ["7", "8", "9"].map((d) => btn("", d, d)).join("") + btn("kp-w", "back", "⌫", ' aria-label="Backspace"') +
        ["4", "5", "6"].map((d) => btn("", d, d)).join("") + btn("", "-", "-") +
        ["1", "2", "3"].map((d) => btn("", d, d)).join("") + btn("", "x", "x") +
        btn("", "0", "0") + (dec ? btn("", ".", ".") : "<span></span>") + btn("kp-n", "next", L("ถัดไป ▸", "Next ▸"), ' style="grid-column:span 2"');
    }
    kp.hidden = false;
    kp.innerHTML = `<div class="kp-head">${head}</div><div class="kp-grid ${isShot && e.mode === "int" ? "kp-int" : isShot && kpWhole == null ? "kp-dec" : isShot ? "kp-ten" : "kp-ser"}">${keys}</div>`;
  }

  function kpCommitShot(el, val) {
    el.value = val; kpWhole = null;
    if (commitShot(el)) { const nx = nextOf(el); if (nx) { lastIn = nx.id; nx.focus(); } else lastIn = null; renderKeypad(); }
  }
  $("keypad").addEventListener("mousedown", (e) => { if (e.target.closest("button")) e.preventDefault(); }); // keep focus where it is
  $("keypad").addEventListener("click", (c) => {
    const b = c.target.closest("[data-kp]");
    const el = kpTarget();
    if (!b || !el) return;
    const k = b.dataset.kp, isShot = el.dataset.i !== undefined;
    if (isShot) {
      if (k === "back") {
        kpWhole = null;
        if (el.value) { el.value = ""; commitShot(el); renderKeypad(); }
        else { const pv = prevOf(el); if (pv) { lastIn = pv.id; pv.focus(); pv.value = ""; commitShot(pv); renderKeypad(); } }
      } else if (k === "undo") { kpWhole = null; renderKeypad(); }
      else if (k[0] === "w") { kpWhole = +k.slice(1); renderKeypad(); }
      else if (k[0] === "t") kpCommitShot(el, `${kpWhole}.${k.slice(1)}`);
      else kpCommitShot(el, k);
      return;
    }
    // series total box
    if (k === "next") { if (commitSer(el)) { const nx = nextOf(el); if (nx) { lastIn = nx.id; nx.focus(); } else { lastIn = null; el.blur(); } renderKeypad(); } }
    else if (k === "back") el.value = el.value.slice(0, -1);
    else el.value += k;
    if (k !== "next") { el.focus(); el.removeAttribute("aria-invalid"); }
  });
  window.addEventListener("resize", () => { if (UI.sel && UI.keypad == null) renderCard(); });

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
    p.innerHTML = `<h2>${L("วางข้อมูลจาก Excel / Google Sheets", "Paste from Excel / Google Sheets")} <small>${L("คัดลอกทั้งตารางแล้ววางด้านล่าง (แถวหัวตารางจะถูกข้ามอัตโนมัติ)", "Copy the whole table and paste below (a header row is skipped automatically)")}</small></h2>
    <p class="rules">${L("ลำดับคอลัมน์:", "Column order:")} <b>${L("ชื่อ · สังกัด · ประเภท (W/M หรือ หญิง/ชาย) · ผลัด · ลู่ · S1 · S2 · …", "name · team · category (W/M) · relay · lane · S1 · S2 · …")}</b> — ${L("คอลัมน์ S เว้นว่างได้ ใส่ได้ทั้ง", "S columns may be empty; use")} <code>89-1x</code> ${L("หรือ", "or")} <code>89</code></p>
    <p class="rules"><a href="templates/athlete-import-template.xlsx" download>${L("⬇ ดาวน์โหลดเทมเพลต Excel", "⬇ Download the Excel template")}</a></p>
    <pre>name\tteam\tcat\trelay\tlane\tS1\tS2
Somying Jaidee\tTU\tW\t1\t3\t89-1x\t87-0x
Somchai Yingtrong\tTU\tM\t1\t4</pre>
    <textarea id="impText" rows="7" aria-label="Pasted rows"></textarea>
    <div class="rowbtns"><button type="button" class="primary" id="impGo">${L("นำเข้า", "Import")}</button><button type="button" class="ghost" id="impClose">${L("ปิด", "Close")}</button><span class="meta" id="impMsg"></span></div>`;
    $("impClose").onclick = () => { p.hidden = true; };
    $("impText").addEventListener("input", () => {
      const r = S.parseImport($("impText").value, evKey());
      $("impMsg").textContent = r.rows.length ? L(`พบ ${r.rows.length} คน${r.bad ? ` · ค่าคะแนนอ่านไม่ได้ ${r.bad} ช่อง (จะเว้นว่าง)` : ""}`, `Found ${r.rows.length} athletes${r.bad ? ` · ${r.bad} unreadable score cells (left empty)` : ""}`) : "";
    });
    $("impGo").onclick = async () => {
      const c = comp(), r = S.parseImport($("impText").value, evKey());
      if (!r.rows.length) { $("impMsg").textContent = L("ไม่พบข้อมูล — วางจากตารางที่มีคอลัมน์ชื่อก่อน", "No data found — paste a table whose first column is the name"); return; }
      $("impGo").disabled = true;
      let done = 0;
      for (let i = 0; i < r.rows.length; i += 100) {
        const chunk = r.rows.slice(i, i + 100).map((x) => ({ ...x, competition_id: c.id }));
        const res = await run(() => sb.from("athletes").insert(chunk).select("*"));
        if (!res) { $("impMsg").textContent = L(`นำเข้าไม่สำเร็จ (นำเข้าแล้ว ${done}/${r.rows.length}) — ดูข้อความผิดพลาดด้านบน`, `Import failed (${done}/${r.rows.length} imported) — see the error above`); $("impGo").disabled = false; if (W) W.refresh(); return; }
        res.data.forEach((row) => athletes().set(row.id, row));
        done += chunk.length;
        $("impMsg").textContent = L(`นำเข้าแล้ว ${done}/${r.rows.length}`, `Imported ${done}/${r.rows.length}`);
      }
      $("impGo").disabled = false; $("impText").value = "";
      renderTabs(); renderBoard();
    };
  };

  /* ---------- change history ---------- */
  let histRows = [], histOnly = false, histTimer = null;
  const hv = (x) => (x === "" || x == null ? "—" : x);
  const fieldLabel = (f) => ({ name: L("ชื่อ", "Name"), uni: L("สังกัด", "Team"), cat: L("ประเภท", "Category"), relay: L("ผลัด", "Relay"), lane: L("ลู่", "Lane") }[f] || f);
  function describeChange(c) {
    if (c.f === "shots") return `S${Math.floor(c.i / 10) + 1} ${L("นัดที่", "shot")} ${(c.i % 10) + 1}: ${hv(c.old)} → ${hv(c.new)}`;
    if (c.f === "ser") return `S${c.i + 1} ${L("รวมชุด", "total")}: ${hv(c.old)} → ${hv(c.new)}`;
    return `${fieldLabel(c.f)}: ${hv(c.old)} → ${hv(c.new)}`;
  }
  function renderHistory() {
    const p = $("historyPanel");
    if (p.hidden) return;
    const c = comp();
    const rows = histRows.map((e) => {
      const who = esc((e.changed_by_email || L("ระบบ / SQL", "system / SQL")).split("@")[0]);
      const when = esc(new Date(e.changed_at).toLocaleString(L("th-TH", "en-GB"), { dateStyle: "short", timeStyle: "medium" }));
      let what, act = "";
      if (e.action === "insert") what = `<span class="tag add">${L("เพิ่ม", "Added")}</span>`;
      else if (e.action === "delete") {
        what = `<span class="tag del">${L("ลบ", "Deleted")}</span>`;
        if (c && !athletes().has(e.athlete_id) && e.snapshot) act = `<button type="button" class="ghost" data-restore="${e.id}">${L("กู้คืน", "Restore")}</button>`;
      } else {
        const ch = e.changes || [];
        what = ch.slice(0, 4).map((x) => `<span class="chg">${esc(describeChange(x))}</span>`).join("") + (ch.length > 4 ? `<span class="chg">+${ch.length - 4}</span>` : "");
        if (athletes().has(e.athlete_id)) act = `<button type="button" class="ghost" data-undo="${e.id}">${L("ย้อนกลับ", "Undo")}</button>`;
      }
      return `<div class="hrow"><div class="hmeta">${when}<br>${who}</div><div class="hbody"><b>${esc(e.athlete_name)}</b> ${what}</div><div>${act}</div></div>`;
    }).join("");
    $("histList").innerHTML = rows || `<p class="empty">${L("ยังไม่มีประวัติการแก้ไข", "No changes recorded yet")}</p>`;
  }
  async function loadHistory() {
    const c = comp(); if (!c || $("historyPanel").hidden) return;
    let q = sb.from("athlete_log").select("*").eq("competition_id", c.id).order("changed_at", { ascending: false }).order("id", { ascending: false }).limit(150);
    if (histOnly && UI.sel) q = q.eq("athlete_id", UI.sel);
    const { data, error } = await q;
    if (error) { $("histList").innerHTML = `<div class="notice err">${esc(error.message)}</div>`; return; }
    histRows = data; renderHistory();
  }
  function histShell() {
    $("historyPanel").innerHTML = `<h2>${L("ประวัติการแก้ไข", "Change history")} <small>${L("ใคร แก้อะไร เมื่อไร — แสดง 150 รายการล่าสุด", "who changed what and when — latest 150")}</small></h2>
      <div class="rowbtns" style="margin:0 0 8px"><label class="chk"><input type="checkbox" id="histOnly"${histOnly ? " checked" : ""}> ${L("เฉพาะนักกีฬาที่เลือก", "Selected athlete only")}</label>
      <button type="button" id="histRefresh">${L("รีเฟรช", "Refresh")}</button><button type="button" class="ghost" id="histClose">${L("ปิด", "Close")}</button><span class="meta" id="histMsg"></span></div>
      <div id="histList"></div>`;
    $("histOnly").onchange = () => { histOnly = $("histOnly").checked; loadHistory(); };
    $("histRefresh").onclick = loadHistory;
    $("histClose").onclick = closeHistory;
  }
  function closeHistory() { $("historyPanel").hidden = true; clearInterval(histTimer); }
  $("histBtn").onclick = () => {
    const p = $("historyPanel");
    if (!p.hidden) { closeHistory(); return; }
    p.hidden = false; histShell(); loadHistory();
    clearInterval(histTimer); histTimer = setInterval(loadHistory, 10000);
  };
  $("historyPanel").addEventListener("click", async (ev2) => {
    const u = ev2.target.closest("[data-undo]"), rs = ev2.target.closest("[data-restore]");
    if (!u && !rs) return;
    const e = histRows.find((x) => String(x.id) === (u || rs).dataset[u ? "undo" : "restore"]);
    if (!e) return;
    $("histMsg").textContent = "";
    if (u) {
      await flushAll();
      const a = athletes().get(e.athlete_id);
      if (!a) { $("histMsg").textContent = L("นักกีฬาถูกลบแล้ว — ใช้ “กู้คืน”", "Athlete was deleted — use Restore"); return; }
      const fields = {}, shots = {}, ser = {};
      let n = 0, skipped = 0;
      for (const c of e.changes || []) {
        const cur = c.f === "shots" ? (a.shots || [])[c.i] || "" : c.f === "ser" ? (a.ser || [])[c.i] || "" : a[c.f] ?? "";
        if (cur !== c.new) { skipped++; continue; }
        n++;
        if (c.f === "shots") shots[c.i] = c.old; else if (c.f === "ser") ser[c.i] = c.old; else fields[c.f] = c.old;
      }
      if (!n) { $("histMsg").textContent = L("ค่านี้ถูกแก้ไปแล้ว ย้อนกลับไม่ได้", "Changed again since — cannot undo"); return; }
      const res = await run(() => sb.rpc("patch_athlete", { aid: a.id, fields, shot_patch: shots, ser_patch: ser }));
      if (res && res.data) athletes().set(a.id, overlay(res.data));
      refreshLive(); renderBoard(); if (!$("card").contains(document.activeElement)) renderCard();
      $("histMsg").textContent = res ? L(`ย้อนกลับแล้ว ${n} รายการ${skipped ? ` (ข้าม ${skipped} ที่ถูกแก้ภายหลัง)` : ""}`, `Undone: ${n} change(s)${skipped ? ` (${skipped} skipped, changed since)` : ""}`) : "";
    } else {
      const sn = e.snapshot, c = comp();
      if (!c) return;
      const res = await run(() => sb.from("athletes").insert({ id: sn.id, competition_id: c.id, name: sn.name, uni: sn.uni, cat: sn.cat, relay: sn.relay, lane: sn.lane, shots: sn.shots, ser: sn.ser }).select("*").single());
      if (res && res.data) { athletes().set(res.data.id, res.data); renderTabs(); renderBoard(); $("histMsg").textContent = L("กู้คืนนักกีฬาแล้ว", "Athlete restored"); }
    }
    loadHistory();
  });

  /* ---------- printable sheet ---------- */
  $("printBtn2").onclick = () => { const c = comp(); if (c) window.open("print.html?c=" + encodeURIComponent(c.id), "_blank", "noopener"); };

  /* ---------- CSV ---------- */
  $("copyBtn").onclick = async () => {
    const c = comp(); if (!c) return;
    const csv = S.toTSV([...athletes().values()], c.event, c.team_size, c.name);
    try {
      await navigator.clipboard.writeText(csv);
      $("saveStatus").className = "save ok"; $("saveStatus").textContent = L("✓ คัดลอกผลแล้ว — วางใน Google Sheets / Excel ได้เลย", "✓ Results copied — paste into Google Sheets / Excel");
      setTimeout(setSave, 4000);
    } catch (err) {
      const box = $("confirmBox"); box.hidden = false;
      box.innerHTML = `<div class="confirm" style="flex-direction:column;align-items:stretch"><span>${L("คัดลอกอัตโนมัติไม่ได้ — เลือกข้อความแล้วกด Ctrl+C", "Could not copy automatically — select the text and press Ctrl+C")}</span><textarea id="csvOut" rows="6" style="font-family:var(--mono);font-size:.8rem;width:100%">${esc(csv)}</textarea><button type="button" id="csvClose">${L("ปิด", "Close")}</button></div>`;
      $("csvOut").select(); $("csvClose").onclick = () => { box.hidden = true; box.innerHTML = ""; };
    }
  };

  I18n.onChange(() => {
    fillSelects(); paintDenied();
    if (!$("historyPanel").hidden) { histShell(); renderHistory(); }
    if (appRunning) { renderAll(); showNotice(""); }
  });
  paintDenied();
  view("loadingView");
})();
