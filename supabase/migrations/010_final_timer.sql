-- Final shot timer: staff start it in the Final panel, the projector board counts down.
--   {"cat": "W", "label": "S1", "secs": 250, "start": "2026-11-06T10:00:00.000Z"}  (null = no timer)
-- Existing RLS already limits updates on competitions to staff, and realtime already covers this table.
alter table public.competitions add column if not exists final_timer jsonb;
