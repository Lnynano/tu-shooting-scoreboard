/* Light / dark toggle. Remembers the choice; default follows the OS (css/style.css handles both). */
(function () {
  "use strict";
  const KEY = "tu-theme", root = document.documentElement;
  const mq = window.matchMedia ? window.matchMedia("(prefers-color-scheme: dark)") : null;
  let saved = null;
  try { saved = localStorage.getItem(KEY); } catch (e) {}
  if (saved === "light" || saved === "dark") root.setAttribute("data-theme", saved);

  const isDark = () => (root.getAttribute("data-theme") ? root.getAttribute("data-theme") === "dark" : !!(mq && mq.matches));

  function init() {
    const host = document.querySelector("header .status");
    if (!host) return;
    const b = document.createElement("button");
    b.type = "button"; b.className = "ghost theme-btn";
    const paint = () => {
      const d = isDark();
      b.textContent = d ? "☀ สว่าง" : "☾ มืด";
      b.setAttribute("aria-label", d ? "สลับเป็นโหมดสว่าง (Light mode)" : "สลับเป็นโหมดมืด (Dark mode)");
    };
    b.onclick = () => {
      const next = isDark() ? "light" : "dark";
      root.setAttribute("data-theme", next);
      try { localStorage.setItem(KEY, next); } catch (e) {}
      paint();
    };
    paint();
    host.insertBefore(b, host.firstChild);
    if (mq && mq.addEventListener) mq.addEventListener("change", paint);
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init); else init();
})();
