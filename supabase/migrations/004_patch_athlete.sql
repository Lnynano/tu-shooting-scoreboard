-- Safe concurrent edits: change only the fields / shots / series that were edited, in one locked step,
-- so two staff editing different parts of the same athlete cannot overwrite each other.
--   fields     : {"name":"..","uni":"..","cat":"W","relay":"..","lane":".."}   (only keys present are changed)
--   shot_patch : {"10":"X","11":"9"}  index (0-based) -> value
--   ser_patch  : {"0":"91-3x"}        index (0-based) -> value
-- SECURITY INVOKER: row level security still limits this to staff.
create or replace function public.patch_athlete(
  aid uuid,
  fields jsonb default '{}'::jsonb,
  shot_patch jsonb default '{}'::jsonb,
  ser_patch jsonb default '{}'::jsonb
)
returns public.athletes
language plpgsql
security invoker
set search_path = ''
as $$
declare
  a public.athletes;
  sh text[];
  se text[];
  k text;
  i int;
begin
  select * into a from public.athletes where id = aid for update;
  if not found then
    raise exception 'athlete not found or no permission';
  end if;

  sh := a.shots;
  se := a.ser;

  for k in select jsonb_object_keys(shot_patch) loop
    i := k::int;
    if i < 0 or i > 99 then raise exception 'shot index out of range'; end if;
    while coalesce(array_length(sh, 1), 0) < i + 1 loop sh := sh || ''::text; end loop;
    sh[i + 1] := shot_patch ->> k;
  end loop;

  for k in select jsonb_object_keys(ser_patch) loop
    i := k::int;
    if i < 0 or i > 99 then raise exception 'series index out of range'; end if;
    while coalesce(array_length(se, 1), 0) < i + 1 loop se := se || ''::text; end loop;
    se[i + 1] := ser_patch ->> k;
  end loop;

  update public.athletes set
    name  = case when fields ? 'name'  then fields ->> 'name'  else name  end,
    uni   = case when fields ? 'uni'   then fields ->> 'uni'   else uni   end,
    cat   = case when fields ? 'cat'   then fields ->> 'cat'   else cat   end,
    relay = case when fields ? 'relay' then fields ->> 'relay' else relay end,
    lane  = case when fields ? 'lane'  then fields ->> 'lane'  else lane  end,
    shots = sh,
    ser   = se
  where id = aid
  returning * into a;

  return a;
end;
$$;
revoke all on function public.patch_athlete(uuid, jsonb, jsonb, jsonb) from public, anon;
grant execute on function public.patch_athlete(uuid, jsonb, jsonb, jsonb) to authenticated;
