/* Pure logic: apply one Supabase Realtime "athletes" change to the in-memory Map of the watched competition.
   The realtime subscription is NOT filtered by competition: Supabase does not deliver DELETE events on a filtered
   subscription (a deleted row only carries its primary key), so filtering happens here. */
(function (root) {
  "use strict";

  // map: Map<id,row>; payload: {eventType, new, old}; cid: watched competition id; tf: optional row transform.
  // Returns true when the map changed (caller should re-render).
  function applyAthleteEvent(map, payload, cid, tf) {
    const t = tf || ((r) => r);
    if (payload.eventType === "DELETE") {
      const id = payload.old && payload.old.id;
      return id !== undefined && map.delete(id);
    }
    const row = payload.new;
    if (!row || row.competition_id !== cid) return false;     // another competition's athlete
    map.set(row.id, t(row));
    return true;
  }

  const api = { applyAthleteEvent };
  root.AthleteEvents = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
