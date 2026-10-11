/* QR code helpers. Needs js/vendor/qrcode.js (qrcode-generator 1.4.4, MIT). Always black on white so any phone can scan it. */
(function () {
  "use strict";

  // SVG string for `text` (error correction M, 4-module white quiet zone). Scales to any size via CSS width.
  function svg(text, opts) {
    const o = Object.assign({ margin: 4 }, opts);
    const q = window.qrcode(0, "M");
    q.addData(String(text));
    q.make();
    const n = q.getModuleCount(), m = o.margin, size = n + m * 2;
    let d = "";
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (q.isDark(r, c)) d += `M${c + m} ${r + m}h1v1h-1z`;
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" shape-rendering="crispEdges" role="img" aria-label="QR code"><rect width="${size}" height="${size}" fill="#fff"/><path d="${d}" fill="#000"/></svg>`;
  }

  // Address of the PUBLIC scoreboard, based on where this site is hosted.
  // keepCompetition = true keeps ?c=<id> from the current page (locks the code to one competition);
  // otherwise it is the plain site address, which always shows the competition that is currently displayed.
  function publicUrl(keepCompetition) {
    const u = new URL("./", location.href);
    const c = new URLSearchParams(location.search).get("c");
    if (keepCompetition && c) u.searchParams.set("c", c);
    return u.href;
  }

  window.QR = { svg, publicUrl };
})();
