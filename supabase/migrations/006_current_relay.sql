-- "Now shooting": the relay that is on the line right now (empty = none). Set by staff, highlighted on the public page and board.
-- Existing RLS already limits updates on competitions to staff, and realtime already covers this table.
alter table public.competitions add column if not exists current_relay text not null default '';
