/* Supabase client + live data watcher. Needs supabase-js v2 UMD and js/config.js loaded first. */
(function () {
  "use strict";
  const cfg = window.TU_CONFIG;
  const sb = window.supabase.createClient(cfg.url, cfg.key);

  const byName = (a, b) => String(a.name).localeCompare(String(b.name), "th") || (a.id < b.id ? -1 : 1);

  /* Watch one competition (by id, or the active one when id is null) and its athletes.
     onChange(state): state = {comp, athletes: Map, list(): sorted array, loaded}
     onStatus(status, message): status = connecting | live | offline | error
     skip(id): return true to ignore realtime updates for that athlete (unsaved local edits). */
  function watch({ id = null, onChange, onStatus, skip }) {
    const S = {
      comp: null, athletes: new Map(), loaded: false,
      list() { return [...S.athletes.values()].sort(byName); }
    };
    let chC = null, chA = null, poll = null, stopped = false, compTimer = null;
    let stC = "connecting", stA = "ok";
    let lastStatus = "";

    const emit = () => { if (!stopped) onChange(S); };
    function status(s, msg) {
      const key = s + "|" + (msg || "");
      if (key === lastStatus) return;
      lastStatus = key;
      if (!stopped && onStatus) onStatus(s, msg);
    }
    function recompute() {
      if (stC === "SUBSCRIBED" && (stA === "ok" || stA === "SUBSCRIBED")) status("live");
      else if (stC === "connecting") status("connecting");
      else status("offline");
    }

    async function fetchComp() {
      let q = sb.from("competitions").select("*");
      q = id ? q.eq("id", id) : q.eq("is_active", true).order("created_at", { ascending: false }).limit(1);
      const { data, error } = await q.maybeSingle();
      if (error) throw error;
      return data;
    }
    async function fetchAthletes() {
      if (!S.comp) { S.athletes = new Map(); return; }
      const { data, error } = await sb.from("athletes").select("*").eq("competition_id", S.comp.id);
      if (error) throw error;
      const next = new Map();
      for (const r of data) next.set(r.id, skip && skip(r.id) && S.athletes.has(r.id) ? S.athletes.get(r.id) : r);
      S.athletes = next;
    }

    function subAthletes() {
      if (chA) { sb.removeChannel(chA); chA = null; }
      stA = "ok";
      if (!S.comp || stopped) return;
      const cid = S.comp.id;
      stA = "connecting";
      chA = sb.channel("ath-" + cid + "-" + Math.random().toString(36).slice(2, 7))
        .on("postgres_changes", { event: "*", schema: "public", table: "athletes", filter: "competition_id=eq." + cid }, (p) => {
          if (p.eventType === "DELETE") S.athletes.delete(p.old.id);
          else if (!(skip && skip(p.new.id))) S.athletes.set(p.new.id, p.new);
          emit();
        })
        .subscribe((s) => { stA = s; recompute(); if (s === "SUBSCRIBED" && S.loaded) refresh(); });
    }

    // Full reload (comp + athletes). Used on start, reconnect, and as a 30s safety net.
    async function refresh() {
      try {
        const comp = await fetchComp();
        const changed = (comp && comp.id) !== (S.comp && S.comp.id);
        S.comp = comp;
        if (changed) subAthletes();
        await fetchAthletes();
        S.loaded = true;
        emit();
        if (lastStatus.startsWith("error")) recompute();
      } catch (e) {
        S.loaded = S.loaded || false;
        status("error", e.message || String(e));
      }
    }

    chC = sb.channel("comp-" + (id || "active") + "-" + Math.random().toString(36).slice(2, 7))
      .on("postgres_changes", { event: "*", schema: "public", table: "competitions" }, () => {
        clearTimeout(compTimer);
        compTimer = setTimeout(refresh, 150);
      })
      .subscribe((s) => { stC = s; recompute(); if (s === "SUBSCRIBED" && S.loaded) refresh(); });

    refresh();
    poll = setInterval(refresh, 30000);

    return {
      state: S,
      refresh,
      stop() {
        stopped = true;
        clearInterval(poll); clearTimeout(compTimer);
        if (chC) sb.removeChannel(chC);
        if (chA) sb.removeChannel(chA);
      }
    };
  }

  async function listCompetitions() {
    const { data, error } = await sb.from("competitions").select("*").order("created_at", { ascending: false });
    if (error) throw error;
    return data;
  }

  window.TU = { sb, watch, listCompetitions };
})();
