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

  // EN | TH segmented switch: the active language is highlighted, so it is never ambiguous.
  let seg = null;
  function paint() {
    if (!seg) return;
    seg.querySelectorAll("button").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.lang === lang)));
  }
  function init() {
    applyAttrs();
    const host = document.querySelector("header .status");
    if (!host) return;
    seg = document.createElement("div");
    seg.className = "lang-seg"; seg.setAttribute("role", "group"); seg.setAttribute("aria-label", "Language / ภาษา");
    for (const [code, label, name] of [["th", "TH", "ภาษาไทย"], ["en", "EN", "English"]]) {
      const b = document.createElement("button");
      b.type = "button"; b.dataset.lang = code; b.textContent = label; b.lang = code; b.setAttribute("aria-label", name);
      b.onclick = () => api.set(code);
      seg.appendChild(b);
    }
    paint();
    host.insertBefore(seg, host.firstChild);
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init); else init();
})();
