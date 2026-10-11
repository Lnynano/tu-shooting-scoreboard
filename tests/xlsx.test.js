// Run: node tests/xlsx.test.js
// Builds a results workbook and checks the ZIP container is valid (signatures, entry list, CRC of every file)
// and that the sheet XML holds the same numbers that js/scoring.js computes.
const assert = require("assert");
const zlib = require("zlib");
const S = require("../js/scoring.js");
global.Scoring = S;
const X = require("../js/xlsx.js");

const mk = (id, name, uni, cat, ser, shots) => ({ id, name, uni, cat, relay: "1", lane: id, ser, shots: shots || [] });
const athletes = [
  mk("1", "สมหญิง ใจดี", "TU", "W", ["91-2x", "90-1x", "92-3x", "89-0x", "93-2x", "90-1x"]),
  mk("2", "Alice & <Bob>", "tu", "W", ["88-1x", "87", "90-2x", "86", "89", "88"]),
  mk("3", "ปวีณา", "KU", "W", ["", "", "", "", "", ""]),
  mk("4", "สมชาย", "TU", "M", ["93-3x", "94-2x", "92-1x", "95-4x", "93-2x", "94-3x"])
];
const comp = { name: "Test <&> comp", event: "ap60", team_size: 3 };
const bytes = X.resultsWorkbook(comp, athletes, { now: new Date("2026-10-12T03:00:00") });

// --- ZIP container: end record, central directory, local headers, CRCs
const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
assert.strictEqual(dv.getUint32(0, true), 0x04034b50, "starts with a local file header");
const eocd = bytes.length - 22;
assert.strictEqual(dv.getUint32(eocd, true), 0x06054b50, "ends with the end-of-central-directory record");
const count = dv.getUint16(eocd + 10, true), cdOffset = dv.getUint32(eocd + 16, true);
const dec = new TextDecoder(), parts = {};
let p = cdOffset;
for (let i = 0; i < count; i++) {
  assert.strictEqual(dv.getUint32(p, true), 0x02014b50, "central directory entry");
  const crc = dv.getUint32(p + 16, true), size = dv.getUint32(p + 24, true), nameLen = dv.getUint16(p + 28, true), local = dv.getUint32(p + 42, true);
  const name = dec.decode(bytes.subarray(p + 46, p + 46 + nameLen));
  assert.strictEqual(dv.getUint32(local, true), 0x04034b50, "local header for " + name);
  const start = local + 30 + dv.getUint16(local + 26, true) + dv.getUint16(local + 28, true);
  const data = bytes.subarray(start, start + size);
  assert.strictEqual(zlib.crc32(data) >>> 0, crc, "CRC of " + name);
  parts[name] = dec.decode(data);
  p += 46 + nameLen;
}
for (const n of ["[Content_Types].xml", "_rels/.rels", "xl/workbook.xml", "xl/_rels/workbook.xml.rels", "xl/styles.xml"]) assert.ok(parts[n], "has " + n);
const sheetNames = Object.keys(parts).filter((n) => n.startsWith("xl/worksheets/"));
assert.strictEqual(sheetNames.length, 5, "Info + women + women team + men + men team");
for (const n of Object.keys(parts)) assert.ok(!/[\u0000-\u0008]/.test(parts[n]), "no control characters in " + n);

// --- content: numbers are numbers, text is escaped
const women = parts["xl/worksheets/sheet2.xml"];
const t = S.resultTables(athletes, "ap60", 3);
assert.strictEqual(t.W.ind[0].total, 545);
assert.ok(women.includes("<v>545</v>"), "first woman's total is the number 545");
assert.ok(women.includes("Alice &amp; &lt;Bob&gt;"), "special characters are escaped");
assert.ok(parts["xl/workbook.xml"].includes('name="บุคคลหญิง"'), "Thai sheet names");
const team = parts["xl/worksheets/sheet3.xml"];
assert.ok(team.includes("<v>1073</v>"), "TU + tu are one team: 545 + 528 = 1073");
assert.ok(parts["xl/worksheets/sheet1.xml"].includes("Test &lt;&amp;&gt; comp"), "competition name escaped on the Info sheet");

// rows are balanced
for (const n of sheetNames) assert.strictEqual((parts[n].match(/<row /g) || []).length, (parts[n].match(/<\/row>/g) || []).length, "rows balanced in " + n);

// decimal (rifle) keeps one decimal
const rifle = X.resultsWorkbook({ name: "r", event: "ar60", team_size: 2 }, [mk("1", "A", "TU", "W", ["104.5", "105.1", "103.2", "104.0", "105.0", "104.8"])], { L: (a, b) => b });
assert.ok(rifle.length > 1000);
assert.strictEqual(S.resultTables([mk("1", "A", "TU", "W", ["104.5", "105.1", "103.2", "104.0", "105.0", "104.8"])], "ar60", 2).W.ind[0].total, 626.6);

// file name is safe
assert.ok(/^[^\\/:*?"<>|]+\.xlsx$/.test(X.fileName({ name: 'a/b:c*?"<>|' })));
console.log("OK — xlsx container, CRCs, escaping and numbers verified");
