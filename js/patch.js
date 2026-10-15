/* Pure helpers for the staff save engine: small per-athlete edit "patches" that are queued, sent, retried and laid
   on top of rows coming from the server. A patch is {fields:{k:v}, shots:{index:v}, ser:{index:v}}. */
(function (root) {
  "use strict";

  const emptyPatch = () => ({ fields: {}, shots: {}, ser: {} });

  // add on top of base; the newer value wins for the same key
  const mergePatch = (base, add) => ({
    fields: { ...base.fields, ...add.fields },
    shots: { ...base.shots, ...add.shots },
    ser: { ...base.ser, ...add.ser }
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
    }
    return o;
  }

  const api = { emptyPatch, mergePatch, queue, requeue, overlay };
  root.Patch = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
