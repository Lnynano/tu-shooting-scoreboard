// Run: node tests/patch.test.js
// Save-engine helpers (js/patch.js). Includes a model of what the database function patch_athlete does,
// to check the claim "two scorers editing the same athlete never overwrite each other".
const assert = require("assert");
const P = require("../js/patch.js");

// ---- queue: newer value wins for the same key, different keys combine
{
  let p = P.queue(undefined, { shots: { 10: "9" } });
  p = P.queue(p, { shots: { 11: "X" } });
  p = P.queue(p, { shots: { 10: "10" } });          // retyped shot 10
  p = P.queue(p, { fields: { lane: "5" } });
  p = P.queue(p, { ser: { 0: "91-2x" } });
  assert.deepStrictEqual(p, { fields: { lane: "5" }, shots: { 10: "10", 11: "X" }, ser: { 0: "91-2x" } });
}

// ---- overlay: unconfirmed local edits sit on top of the server row; input is not mutated
{
  const row = { id: "a", name: "A", lane: "1", shots: ["10"], ser: ["91", "", "88"] };
  const frozen = JSON.stringify(row);
  const sending = { fields: { lane: "2" }, shots: { 3: "X" }, ser: {} };      // in flight
  const pending = { fields: { lane: "3" }, shots: {}, ser: { 1: "90" } };     // typed after that
  const o = P.overlay(row, [sending, pending]);
  assert.strictEqual(JSON.stringify(row), frozen, "row not mutated");
  assert.strictEqual(o.lane, "3", "pending (newest) wins over sending");
  assert.deepStrictEqual(o.shots, ["10", "", "", "X"], "index beyond the row is padded");
  assert.deepStrictEqual(o.ser, ["91", "90", "88"]);
  assert.strictEqual(o.name, "A");
  assert.deepStrictEqual(P.overlay({ id: "b", shots: null, ser: undefined }, [null, undefined]).shots, []);
}

// ---- requeue after a failed save: failed edits kept, newer edits win
{
  const failed = { fields: {}, shots: { 5: "9", 6: "8" }, ser: {} };
  const newer = { fields: {}, shots: { 6: "10" }, ser: { 0: "90" } };
  assert.deepStrictEqual(P.requeue(failed, newer), { fields: {}, shots: { 5: "9", 6: "10" }, ser: { 0: "90" } });
  assert.deepStrictEqual(P.requeue(failed, undefined), failed);
}

// ---- model of patch_athlete (SQL): apply a patch to the stored row
function applyPatch(row, patch) {
  const r = { ...row, shots: [...row.shots], ser: [...row.ser] };
  Object.assign(r, patch.fields);
  for (const [i, v] of Object.entries(patch.shots)) { while (r.shots.length <= +i) r.shots.push(""); r.shots[+i] = v; }
  for (const [k, v] of Object.entries(patch.ser)) { while (r.ser.length <= +k) r.ser.push(""); r.ser[+k] = v; }
  return r;
}
const base = { name: "A", lane: "1", relay: "1", shots: [], ser: ["91", "", "", "", "", ""] };

// two scorers touching DIFFERENT parts: order does not matter and nothing is lost
{
  const mine = { fields: { lane: "5" }, shots: {}, ser: { 1: "90-1x" } };
  const theirs = { fields: { relay: "2" }, shots: { 40: "X", 41: "9" }, ser: { 3: "88" } };
  const ab = applyPatch(applyPatch(base, mine), theirs), ba = applyPatch(applyPatch(base, theirs), mine);
  assert.deepStrictEqual(ab, ba, "patches on different keys commute");
  assert.strictEqual(ab.lane, "5"); assert.strictEqual(ab.relay, "2");
  assert.strictEqual(ab.ser[1], "90-1x"); assert.strictEqual(ab.ser[3], "88"); assert.strictEqual(ab.shots[41], "9");
}
// the old whole-row save would have lost the other scorer's work: show the contrast
{
  const mineWholeRow = { ...base, ser: ["91", "90-1x", "", "", "", ""] };       // built from a stale copy
  const afterTheirs = applyPatch(base, { fields: {}, shots: {}, ser: { 3: "88" } });
  assert.strictEqual(mineWholeRow.ser[3], "", "whole-row overwrite drops S4=88 (the bug the patch design fixes)");
  assert.strictEqual(applyPatch(afterTheirs, { fields: {}, shots: {}, ser: { 1: "90-1x" } }).ser[3], "88", "patch keeps it");
}
// same key: the later patch wins (last writer), as expected
assert.strictEqual(applyPatch(applyPatch(base, { fields: { lane: "2" }, shots: {}, ser: {} }), { fields: { lane: "3" }, shots: {}, ser: {} }).lane, "3");

// ---- realtime row arriving while we have an unconfirmed edit: our edit stays visible, theirs is added
{
  const serverRow = { id: "a", name: "A", lane: "1", shots: [], ser: ["70", "88", "", "", "", ""] };   // other scorer changed S1, S2
  const pending = { fields: {}, shots: {}, ser: { 0: "92-3x" } };                                      // our unsent S1
  const shown = P.overlay(serverRow, [null, pending]);
  assert.strictEqual(shown.ser[0], "92-3x", "our unsent S1 is not flickered away by the incoming row");
  assert.strictEqual(shown.ser[1], "88", "other scorer's S2 appears");
}

console.log("OK — save-engine helpers verified (queue, overlay, requeue, two-scorer model)");
