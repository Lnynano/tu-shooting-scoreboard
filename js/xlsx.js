/* Minimal .xlsx writer (no dependencies): builds a real Excel workbook in the browser.
   An .xlsx file is a ZIP of XML parts; we write the ZIP "stored" (no compression), which every Excel / Sheets / LibreOffice reads.
   Cells are numbers or text; numbers stay numbers so organisers can sort and sum them. */
(function (root) {
  "use strict";

  /* ---------- ZIP (store) ---------- */
  const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
  function crc32(b) { let c = 0xffffffff; for (let i = 0; i < b.length; i++) c = CRC[(c ^ b[i]) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; }
  const enc = new TextEncoder();

  function zip(files) {                       // files: [{name, data: string|Uint8Array}]
    const now = new Date();
    const dosTime = (now.getHours() << 11) | (now.getMinutes() << 5) | (now.getSeconds() >> 1);
    const dosDate = ((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate();
    const parts = [], central = [];
    let offset = 0;
    const u16 = (v) => [v & 255, (v >>> 8) & 255], u32 = (v) => [v & 255, (v >>> 8) & 255, (v >>> 16) & 255, (v >>> 24) & 255];
    for (const f of files) {
      const name = enc.encode(f.name), data = typeof f.data === "string" ? enc.encode(f.data) : f.data, crc = crc32(data);
      const local = new Uint8Array([0x50, 0x4b, 3, 4, ...u16(20), ...u16(0x0800), ...u16(0), ...u16(dosTime), ...u16(dosDate), ...u32(crc), ...u32(data.length), ...u32(data.length), ...u16(name.length), ...u16(0)]);
      parts.push(local, name, data);
      central.push(new Uint8Array([0x50, 0x4b, 1, 2, ...u16(20), ...u16(20), ...u16(0x0800), ...u16(0), ...u16(dosTime), ...u16(dosDate), ...u32(crc), ...u32(data.length), ...u32(data.length), ...u16(name.length), ...u16(0), ...u16(0), ...u16(0), ...u16(0), ...u32(0), ...u32(offset)]), name);
      offset += local.length + name.length + data.length;
    }
    let cdSize = 0; for (const c of central) cdSize += c.length;
    const end = new Uint8Array([0x50, 0x4b, 5, 6, ...u16(0), ...u16(0), ...u16(files.length), ...u16(files.length), ...u32(cdSize), ...u32(offset), ...u16(0)]);
    const all = [...parts, ...central, end];
    let total = 0; for (const p of all) total += p.length;
    const out = new Uint8Array(total); let pos = 0;
    for (const p of all) { out.set(p, pos); pos += p.length; }
    return out;
  }

  /* ---------- sheet XML ---------- */
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c])).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "");
  function colName(i) { let s = ""; for (i++; i > 0; i = Math.floor((i - 1) / 26)) s = String.fromCharCode(65 + ((i - 1) % 26)) + s; return s; }

  // style ids (see styles.xml below): 0 normal, 1 header, 2 decimal 0.0, 3 bold, 4 title
  const S_HEAD = 1, S_DEC = 2, S_BOLD = 3, S_TITLE = 4;
  function sheetXml(sheet) {
    let rows = "";
    sheet.rows.forEach((row, r) => {
      let cells = "";
      row.forEach((cell, c) => {
        let v = cell, style = 0;
        if (v && typeof v === "object" && !(v instanceof Date)) { style = v.s || 0; v = v.v; }
        if (r === 0 && sheet.header) style = S_HEAD;
        if (v === null || v === undefined || v === "") { if (style) cells += `<c r="${colName(c)}${r + 1}" s="${style}"/>`; return; }
        const ref = `${colName(c)}${r + 1}`;
        if (typeof v === "number" && isFinite(v)) {
          if (!style && !Number.isInteger(v)) style = S_DEC;
          cells += `<c r="${ref}"${style ? ` s="${style}"` : ""}><v>${v}</v></c>`;
        } else cells += `<c r="${ref}"${style ? ` s="${style}"` : ""} t="inlineStr"><is><t xml:space="preserve">${esc(v)}</t></is></c>`;
      });
      rows += `<row r="${r + 1}"${r === 0 && sheet.header ? ' ht="22" customHeight="1"' : ""}>${cells}</row>`;
    });
    const cols = (sheet.widths || []).map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join("");
    const pane = sheet.header ? '<pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/>' : "";
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0">${pane}</sheetView></sheetViews><sheetFormatPr defaultRowHeight="15"/>${cols ? `<cols>${cols}</cols>` : ""}<sheetData>${rows}</sheetData></worksheet>`;
  }

  const STYLES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><numFmts count="1"><numFmt numFmtId="164" formatCode="0.0"/></numFmts>
<fonts count="4"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="16"/><color rgb="FFC8102E"/><name val="Calibri"/></font></fonts>
<fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FFC8102E"/><bgColor indexed="64"/></patternFill></fill></fills>
<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="5"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf><xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/><xf numFmtId="0" fontId="2" fillId="0" borderId="0" xfId="0" applyFont="1"/><xf numFmtId="0" fontId="3" fillId="0" borderId="0" xfId="0" applyFont="1"/></cellXfs>
<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`;

  // sheets: [{name, header: bool, widths: [], rows: [[cell,...]]}]  ->  Uint8Array (.xlsx)
  function build(sheets) {
    const safe = (n, i) => { n = String(n).replace(/[\[\]:*?\/\\]/g, " ").trim().slice(0, 31) || "Sheet" + (i + 1); return n; };
    const names = []; sheets.forEach((s, i) => { let n = safe(s.name, i), k = 2; while (names.includes(n)) n = n.slice(0, 28) + " " + k++; names.push(n); });
    const files = [
      { name: "[Content_Types].xml", data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>${sheets.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join("")}<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>` },
      { name: "_rels/.rels", data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>` },
      { name: "xl/workbook.xml", data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${names.map((n, i) => `<sheet name="${esc(n)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join("")}</sheets></workbook>` },
      { name: "xl/_rels/workbook.xml.rels", data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheets.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join("")}<Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>` },
      { name: "xl/styles.xml", data: STYLES },
      ...sheets.map((s, i) => ({ name: `xl/worksheets/sheet${i + 1}.xml`, data: sheetXml(s) }))
    ];
    return zip(files);
  }

  /* ---------- the results workbook ---------- */
  // opts.L(th, en) picks the language (defaults to Thai); opts.now overrides the export time (for tests)
  function resultsWorkbook(comp, athletes, opts) {
    const S = root.Scoring, L = (opts && opts.L) || ((th) => th), now = (opts && opts.now) || new Date();
    const e = S.ev(comp.event), n = S.nSer(comp.event), T = S.resultTables(athletes, comp.event, comp.team_size);
    const sheets = [];
    sheets.push({
      name: L("ข้อมูล", "Info"), widths: [26, 60], rows: [
        [{ v: "Thammasat Shooting Club", s: S_TITLE }],
        [L("การแข่งขัน", "Competition"), { v: comp.name, s: S_BOLD }],
        [L("รายการ", "Event"), L(e.name, e.nameEn)],
        [L("นับทีม", "Team counts"), L(`สมาชิกที่ดีที่สุด ${comp.team_size} คน`, `Best ${comp.team_size} members`)],
        [L("ส่งออกเมื่อ", "Exported"), now.toLocaleString(L("th-TH", "en-GB"))],
        [],
        [L("หมายเหตุ", "Notes"), L("ตัวเลขเป็นตัวเลขจริง เรียงลำดับ/รวมใน Excel ได้ · X = จำนวน inner-ten · นัด = จำนวนนัดที่ยิงแล้ว", "Numbers are real numbers (sortable) · X = inner tens · Shots = shots fired so far")]
      ]
    });
    const indHead = [L("อันดับ", "Rank"), L("ผลัด", "Relay"), L("ลู่", "Lane"), L("สังกัด", "Team"), L("ชื่อ", "Name"), ...Array.from({ length: n }, (_, i) => "S" + (i + 1)), L("รวม", "Total"), "X", L("นัด", "Shots")];
    const tmHead = [L("อันดับ", "Rank"), L("สังกัด", "Team"), L("รวม", "Total"), "X", L("คนที่นับ", "Counted"), L("สมาชิก", "Members")];
    const indWidths = [8, 8, 8, 16, 30, ...Array(n).fill(9), 10, 6, 8], tmWidths = [8, 18, 10, 6, 60, 10];
    const names = { W: [L("บุคคลหญิง", "Women"), L("ทีมหญิง", "Women team")], M: [L("บุคคลชาย", "Men"), L("ทีมชาย", "Men team")] };
    for (const cat of ["W", "M"]) {
      sheets.push({ name: names[cat][0], header: true, widths: indWidths, rows: [indHead, ...T[cat].ind.map((r) => [r.rank, r.relay, r.lane, r.team, r.name, ...r.ser, r.total, e.mode === "int" ? r.x : r.x || null, r.shots])] });
      sheets.push({ name: names[cat][1], header: true, widths: tmWidths, rows: [tmHead, ...T[cat].team.map((t) => [t.rank, t.team, t.total, e.mode === "int" ? t.x : t.x || null, t.counted, t.members])] });
    }
    return build(sheets);
  }

  function fileName(comp) {
    const d = new Date(), p = (x) => String(x).padStart(2, "0");
    const base = String(comp.name || "results").replace(/[\\/:*?"<>|]+/g, " ").trim().replace(/\s+/g, "-").slice(0, 60) || "results";
    return `${base}_results_${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}.xlsx`;
  }
  function download(comp, athletes, opts) {
    const bytes = resultsWorkbook(comp, athletes, opts);
    const blob = new Blob([bytes], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob); a.download = fileName(comp);
    document.body.appendChild(a); a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  }

  const api = { build, zip, crc32, resultsWorkbook, download, fileName };
  root.Xlsx = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
