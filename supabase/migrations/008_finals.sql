-- Finals (10m Air Pistol / 10m Air Rifle). Logic lives in js/finals.js; the database only stores the entries.
--   athletes.final_pos   : start position 1-8 in the final (null = not a finalist). Set when staff start the final.
--   athletes.final_shots : final shots in order, e.g. {"10.4","9.8"} (rifle) or {"10","X"} (pistol)
--   athletes.final_so    : shoot-off shots keyed by the shot number of the tie, e.g. {"12": ["10.1", "9.8"]}
--   competitions.show_final : projector board / public page show the final instead of the qualification table
-- Existing RLS covers the new columns (everyone reads, staff write) and realtime already includes both tables.
alter table public.athletes
  add column if not exists final_pos smallint check (final_pos between 1 and 8),
  add column if not exists final_shots text[] not null default '{}',
  add column if not exists final_so jsonb not null default '{}'::jsonb;
alter table public.competitions add column if not exists show_final boolean not null default false;

-- Safe edits of final entries, like patch_athlete (004) but for the final columns. A new function instead of
-- changing patch_athlete, so the live site keeps working while this is rolled out.
--   shot_patch : {"11": "10.4"}            index (0-based) -> value
--   so_patch   : {"12": {"0": "10.1"}}     shot number of the tie -> shoot-off round (0-based) -> value
-- SECURITY INVOKER: row level security still limits this to staff.
create or replace function public.patch_final(
  aid uuid,
  shot_patch jsonb default '{}'::jsonb,
  so_patch jsonb default '{}'::jsonb
)
returns public.athletes
language plpgsql
security invoker
set search_path = ''
as $$
declare
  a public.athletes;
  sh text[];
  so jsonb;
  arr jsonb;
  k text;
  r text;
  i int;
begin
  select * into a from public.athletes where id = aid for update;
  if not found then
    raise exception 'athlete not found or no permission';
  end if;

  sh := a.final_shots;
  so := a.final_so;

  for k in select jsonb_object_keys(shot_patch) loop
    i := k::int;
    if i < 0 or i > 29 then raise exception 'final shot index out of range'; end if;
    while coalesce(array_length(sh, 1), 0) < i + 1 loop sh := sh || ''::text; end loop;
    sh[i + 1] := shot_patch ->> k;
  end loop;

  for k in select jsonb_object_keys(so_patch) loop
    if k !~ '^[0-9]{1,2}$' then raise exception 'shoot-off key must be a shot number'; end if;
    arr := coalesce(so -> k, '[]'::jsonb);
    for r in select jsonb_object_keys(so_patch -> k) loop
      i := r::int;
      if i < 0 or i > 19 then raise exception 'shoot-off round out of range'; end if;
      while jsonb_array_length(arr) < i + 1 loop arr := arr || '""'::jsonb; end loop;
      arr := jsonb_set(arr, array[r], to_jsonb(so_patch -> k ->> r));
    end loop;
    so := jsonb_set(so, array[k], arr, true);
  end loop;

  update public.athletes set final_shots = sh, final_so = so
  where id = aid
  returning * into a;

  return a;
end;
$$;
revoke all on function public.patch_final(uuid, jsonb, jsonb) from public, anon;
grant execute on function public.patch_final(uuid, jsonb, jsonb) to authenticated;
