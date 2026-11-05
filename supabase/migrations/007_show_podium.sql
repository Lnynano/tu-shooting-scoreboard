-- Podium: when true, the projector board shows the top 3 of each category instead of the full table (award ceremony).
-- Set by staff. Existing RLS already limits updates on competitions to staff, and realtime already covers this table.
alter table public.competitions add column if not exists show_podium boolean not null default false;
