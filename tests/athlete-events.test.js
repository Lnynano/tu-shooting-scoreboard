// Run: node tests/athlete-events.test.js
// Realtime change handling (js/athlete-events.js). Regression test for the review finding that DELETE events were
// lost: the subscription is unfiltered, so the handler must filter by competition itself and delete by id.
const assert = require("assert");
const { applyAthleteEvent } = require("../js/athlete-events.js");

const CID = "comp-1", OTHER = "comp-2";
const row = (id, cid, name) => ({ id, competition_id: cid, name });

const m = new Map([["a", row("a", CID, "A")], ["b", row("b", CID, "B")]]);

// INSERT in the watched competition is added; in another competition it is ignored
assert.strictEqual(applyAthleteEvent(m, { eventType: "INSERT", new: row("c", CID, "C") }, CID), true);
assert.strictEqual(m.size, 3);
assert.strictEqual(applyAthleteEvent(m, { eventType: "INSERT", new: row("x", OTHER, "X") }, CID), false);
assert.strictEqual(m.has("x"), false);

// UPDATE replaces; an update for another competition's athlete does nothing
assert.strictEqual(applyAthleteEvent(m, { eventType: "UPDATE", new: row("a", CID, "A2") }, CID), true);
assert.strictEqual(m.get("a").name, "A2");
assert.strictEqual(applyAthleteEvent(m, { eventType: "UPDATE", new: row("y", OTHER, "Y") }, CID), false);

// DELETE carries only the primary key (no competition_id): it must still remove the athlete
assert.strictEqual(applyAthleteEvent(m, { eventType: "DELETE", old: { id: "b" } }, CID), true);
assert.strictEqual(m.has("b"), false, "deleted athlete is gone");
// DELETE of an athlete we do not hold (other competition) changes nothing and asks for no re-render
assert.strictEqual(applyAthleteEvent(m, { eventType: "DELETE", old: { id: "zzz" } }, CID), false);
assert.strictEqual(applyAthleteEvent(m, { eventType: "DELETE", old: {} }, CID), false);
assert.strictEqual(applyAthleteEvent(m, { eventType: "DELETE" }, CID), false);
assert.strictEqual(m.size, 2);

// the transform (used to overlay unsaved local edits) is applied to inserted/updated rows
const t = (r) => ({ ...r, name: r.name + "*" });
applyAthleteEvent(m, { eventType: "UPDATE", new: row("a", CID, "A3") }, CID, t);
assert.strictEqual(m.get("a").name, "A3*");

// malformed payloads do not throw
assert.strictEqual(applyAthleteEvent(m, { eventType: "INSERT" }, CID), false);

console.log("OK — realtime event handling verified (insert, update, delete-by-id, other competitions)");
