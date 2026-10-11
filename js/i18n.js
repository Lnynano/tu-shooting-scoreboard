/* TH / EN switch. Static HTML uses <span class="l-th">…</span><span class="l-en">…</span> (css hides one);
   JS-built text uses I18n.L(thai, english). Re-render hooks: I18n.onChange(fn). */
(function () {
  "use strict";
  const KEY = "tu-lang", root = document.documentElement, cbs = [];
  let lang = "th";
  try { const s = localStorage.getItem(KEY); if (s === "en" || s === "th") lang = s; } catch (e) {}
  root.lang = lang;

  function applyAttrs() {
    document.querySelectorAll("[data-en-placeholder]").forEach((el) => {
      if (el.dataset.thPlaceholder === undefined) el.dataset.thPlaceholder = el.getAttribute("placeholder") || "";
      el.setAttribute("placeholder", lang === "en" ? el.dataset.enPlaceholder : el.dataset.thPlaceholder);
    });
  }
  const api = {
    get lang() { return lang; },
    L: (th, en) => (lang === "en" ? en : th),
    onChange: (cb) => { cbs.push(cb); },
    set(l) {
      lang = l === "en" ? "en" : "th";
      root.lang = lang;
      try { localStorage.setItem(KEY, lang); } catch (e) {}
      applyAttrs(); paint(); cbs.forEach((cb) => cb(lang));
    }
  };
  window.I18n = api;

  let btn = null;
  function paint() {
    if (!btn) return;
    btn.textContent = lang === "en" ? "TH" : "EN";
    btn.setAttribute("aria-label", lang === "en" ? "สลับเป็นภาษาไทย (Thai)" : "Switch to English");
  }
  function init() {
    applyAttrs();
    const host = document.querySelector("header .status");
    if (!host) return;
    btn = document.createElement("button");
    btn.type = "button"; btn.className = "ghost lang-btn";
    btn.onclick = () => api.set(lang === "en" ? "th" : "en");
    paint();
    host.insertBefore(btn, host.firstChild);
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init); else init();
})();
