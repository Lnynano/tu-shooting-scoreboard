/* Pure helpers for the staff save engine: small per-athlete edit "patches" that are queued, sent, retried and laid
   on top of rows coming from the server. A patch is {fields:{k:v}, shots:{index:v}, ser:{index:v}, fin:{index:v}, so:{shot:{round:v}}}
   (fin = final shots, so = final shoot-off shots keyed by the shot number of the tie). */
(function (root) {
  "use strict";

  const emptyPatch = () => ({ fields: {}, shots: {}, ser: {}, fin: {}, so: {} });
  const hasQual = (p) => !!p && (Object.keys(p.fields).length + Object.keys(p.shots).length + Object.keys(p.ser).length > 0);
  const hasFinal = (p) => !!p && (Object.keys(p.fin || {}).length + Object.keys(p.so || {}).length > 0);
  // shoot-off parts are one level deeper: {"12": {"0": "10.1"}} + {"12": {"1": "9.8"}} keeps both rounds
  const mergeSo = (a, b) => { const o = { ...a }; for (const [k, v] of Object.entries(b || {})) o[k] = { ...(o[k] || {}), ...v }; return o; };

  // add on top of base; the newer value wins for the same key
  const mergePatch = (base, add) => ({
    fields: { ...base.fields, ...add.fields },
    shots: { ...base.shots, ...add.shots },
    ser: { ...base.ser, ...add.ser },
    fin: { ...(base.fin || {}), ...(add.fin || {}) },
    so: mergeSo(base.so || {}, add.so || {})
  });

  // queue one edit: part is {fields:{..}} | {shots:{..}} | {ser:{..}}
  const queue = (existing, part) => mergePatch(existing || emptyPatch(), { ...emptyPatch(), ...part });

  // a save failed: keep it for retry, but edits made meanwhile (newer) win
  const requeue = (failed, newer) => mergePatch(failed, newer || emptyPatch());

  // lay unconfirmed local patches (oldest first) on top of a server row; never mutates `row`
  function overlay(row, patches) {
    const o = { ...row, shots: Array.from(row.shots || [], (v) => v || ""), ser: Array.from(row.ser || [], (v) => v || "") };
    for (const patch of patches) {
      if (!patch) continue;
      Object.assign(o, patch.fields);
      for (const [i, v] of Object.entries(patch.shots)) { while (o.shots.length <= +i) o.shots.push(""); o.shots[+i] = v; }
      for (const [k, v] of Object.entries(patch.ser)) { while (o.ser.length <= +k) o.ser.push(""); o.ser[+k] = v; }
      if (Object.keys(patch.fin || {}).length) {
        o.final_shots = Array.from(o.final_shots || [], (v) => v || "");
        for (const [i, v] of Object.entries(patch.fin)) { while (o.final_shots.length <= +i) o.final_shots.push(""); o.final_shots[+i] = v; }
      }
      for (const [at, rounds] of Object.entries(patch.so || {})) {
        o.final_so = { ...(o.final_so || {}) };
        const arr = Array.from(o.final_so[at] || [], (v) => v || "");
        for (const [r, v] of Object.entries(rounds)) { while (arr.length <= +r) arr.push(""); arr[+r] = v; }
        o.final_so[at] = arr;
      }
    }
    return o;
  }

  const api = { emptyPatch, mergePatch, queue, requeue, overlay, hasQual, hasFinal };
  root.Patch = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
