// Run: node tests/import.test.js
// Excel / Google Sheets paste import: Scoring.parseImport(text, eventKey) -> {rows, bad}
const assert = require("assert");
const S = require("../js/scoring.js");

const T = (...c) => c.join("\t");

// header row is skipped (English and Thai), rows parsed, category read from W/M/หญิง/ชาย
{
  const text = [
    T("ชื่อ-สกุล", "สังกัด", "ประเภท (W/M)", "ผลัด", "ลู่", "S1", "S2"),
    T("สมหญิง ใจดี", "TU", "W", "1", "3", "89-1x", "87-0x"),
    T("สมชาย ยิงตรง", "KU", "ชาย", "2", "4"),
    T("Alice", "CU", "หญิง", "", "")
  ].join("\n");
  const r = S.parseImport(text, "ap60");
  assert.strictEqual(r.rows.length, 3, "header skipped");
  assert.strictEqual(r.bad, 0);
  assert.deepStrictEqual(r.rows.map((x) => x.cat), ["W", "M", "W"]);
  assert.strictEqual(r.rows[0].name, "สมหญิง ใจดี");
  assert.strictEqual(r.rows[0].relay, "1");
  assert.strictEqual(r.rows[0].lane, "3");
  assert.deepStrictEqual(r.rows[0].ser.slice(0, 2), ["89-1x", "87"], "89-1x kept; 87-0x normalised to 87");
  assert.strictEqual(r.rows[0].ser.length, 6, "one entry per series of the event");
  assert.deepStrictEqual(r.rows[1].ser, ["", "", "", "", "", ""], "missing score columns are empty");
}

// "name" header in English; also case-insensitive
assert.strictEqual(S.parseImport(T("Name", "Team", "Cat") + "\n" + T("A", "TU", "M"), "ap60").rows.length, 1);
assert.strictEqual(S.parseImport(T("NAME", "Team", "Cat") + "\n" + T("A", "TU", "M"), "ap60").rows.length, 1);

// blank lines, Windows line endings, surrounding spaces
{
  const r = S.parseImport(`\r\n  ${T("  Somchai  ", " TU ", " m ", " 1 ", " 2 ")}\r\n\r\n`, "ap60");
  assert.strictEqual(r.rows.length, 1);
  assert.strictEqual(r.rows[0].name, "Somchai");
  assert.strictEqual(r.rows[0].uni, "TU");
  assert.strictEqual(r.rows[0].cat, "M");
  assert.strictEqual(r.rows[0].relay, "1");
}

// unreadable score cells are counted and left empty (never invented)
{
  const r = S.parseImport(T("A", "TU", "W", "1", "1", "abc", "89-1x", "200", "-5"), "ap60");
  assert.strictEqual(r.rows.length, 1);
  assert.strictEqual(r.bad, 3, "abc, 200 and -5 are unreadable");
  assert.deepStrictEqual(r.rows[0].ser.slice(0, 4), ["", "89-1x", "", ""]);
}

// decimal event: 102.4 style, comma decimal, and an integer-only value is accepted as X.0
{
  const r = S.parseImport(T("R", "TU", "W", "1", "1", "102.4", "103,5", "105"), "ar60");
  assert.strictEqual(r.bad, 0);
  assert.deepStrictEqual(r.rows[0].ser.slice(0, 3), ["102.4", "103.5", "105.0"]);
}

// comma separated paste works when there are no tabs
{
  const r = S.parseImport("A,TU,W,1,2,90\nB,KU,M,1,3,91", "ap60");
  assert.strictEqual(r.rows.length, 2);
  assert.strictEqual(r.rows[1].ser[0], "91");
}

// an empty / header-only paste imports nothing
assert.strictEqual(S.parseImport("", "ap60").rows.length, 0);
assert.strictEqual(S.parseImport(T("ชื่อ", "สังกัด"), "ap60").rows.length, 0);

// a row with an empty name is skipped
assert.strictEqual(S.parseImport(T("", "TU", "W"), "ap60").rows.length, 0);

// series count follows the event (30-shot event = 3 series)
assert.strictEqual(S.parseImport(T("A", "TU", "W", "1", "1", "90"), "ap30").rows[0].ser.length, 3);

// score parsing edge cases the importer relies on
assert.strictEqual(S.parseSeries("89-1x", "int").norm, "89-1x");
assert.strictEqual(S.parseSeries("5-1x", "int"), false, "1 X needs at least 10 points");
assert.strictEqual(S.parseSeries("101", "int"), false, "a series cannot exceed 100");
assert.strictEqual(S.parseSeries("109.1", "dec"), false, "109.1 > 109.0 is impossible");

console.log("OK — import parsing verified");
