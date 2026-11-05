// Run: node tests/watch.test.js
// js/supabase.js with a fake Supabase client (no network). Checks:
//  - overlapping refreshes: a slow, older reply never replaces newer data
//  - a broken ?c= id is "not found" without asking the database
const assert = require("assert");

// Fake client: every query waits until the test resolves it, so the test controls the order replies arrive in.
const pending = [];
function query(table) {
  const q = { table, filters: [] };
  const done = () => new Promise((resolve) => pending.push({ q, resolve }));
  const chain = {
    select() { return chain; },
    eq(k, v) { q.filters.push([k, v]); return chain; },
    order() { return chain; },
    limit() { return chain; },
    maybeSingle: done,
    then(ok, bad) { return done().then(ok, bad); }   // athletes query is awaited directly
  };
  return chain;
}
const channel = { on() { return channel; }, subscribe() { return channel; } };
global.window = global;
global.TU_CONFIG = { url: "http://fake", key: "fake" };
global.supabase = { createClient: () => ({ from: query, channel: () => channel, removeChannel() {} }) };
global.AthleteEvents = require("../js/athlete-events.js");
global.setInterval = () => 0; global.clearInterval = () => {};   // no 30 s poll in the test
require("../js/supabase.js");
const TU = global.TU;

const tick = () => new Promise((r) => setImmediate(r));
const take = (table) => { const i = pending.findIndex((p) => p.q.table === table); assert.ok(i >= 0, "a pending " + table + " query"); return pending.splice(i, 1)[0]; };

(async () => {
  // --- isId
  assert.ok(TU.isId("3f2b8c1e-9a4d-4e6f-8b7a-1c2d3e4f5a6b"));
  for (const bad of ["", null, "abc", "3f2b8c1e-9a4d-4e6f-8b7a", "3f2b8c1e-9a4d-4e6f-8b7a-1c2d3e4f5a6b'--", "' or 1=1"]) assert.ok(!TU.isId(bad), String(bad));

  // --- overlapping refreshes: the newest wins even when the older reply arrives last
  const comp = { id: "c1", name: "Comp" };
  let last = null, emits = 0;
  const w = TU.watch({ id: null, onChange: (s) => { last = s; emits++; } });
  // refresh #1 (start) is waiting for its competition query; start refresh #2
  await tick();
  const c1 = take("competitions");
  w.refresh(); await tick();
  const c2 = take("competitions");
  c2.resolve({ data: comp, error: null }); await tick();
  const a2 = take("athletes");
  c1.resolve({ data: comp, error: null }); await tick();
  assert.strictEqual(pending.filter((p) => p.q.table === "athletes").length, 0, "the stale refresh stops before asking for athletes");
  a2.resolve({ data: [{ id: "x", name: "New", competition_id: "c1" }], error: null }); await tick();
  assert.strictEqual(emits, 1);
  assert.deepStrictEqual(last.list().map((a) => a.name), ["New"]);

  // now an older athletes reply arriving after a newer one must be ignored
  w.refresh(); await tick(); take("competitions").resolve({ data: comp, error: null }); await tick();
  const old = take("athletes");
  w.refresh(); await tick(); take("competitions").resolve({ data: comp, error: null }); await tick();
  const fresh = take("athletes");
  fresh.resolve({ data: [{ id: "x", name: "Newest", competition_id: "c1" }], error: null }); await tick();
  old.resolve({ data: [{ id: "x", name: "Stale", competition_id: "c1" }], error: null }); await tick();
  assert.deepStrictEqual(last.list().map((a) => a.name), ["Newest"], "stale reply did not overwrite");
  w.stop();

  // --- a broken id: no database query, shows "not found" (comp null) instead of an error
  let st = null, s2 = null;
  const w2 = TU.watch({ id: "not-a-uuid", onChange: (s) => { s2 = s; }, onStatus: (s) => { st = s; } });
  await tick(); await tick();
  assert.strictEqual(pending.length, 0, "no query sent for a broken id");
  assert.ok(s2 && s2.loaded && s2.comp === null, "loaded with no competition");
  assert.notStrictEqual(st, "error");
  w2.stop();

  console.log("OK — watch: newest refresh wins, stale replies ignored, broken ?c= id handled without a query");
})().catch((e) => { console.error(e); process.exit(1); });
