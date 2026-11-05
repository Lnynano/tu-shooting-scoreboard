-- Change history also records the final (008): start position, each final shot, and shoot-off shots.
-- Same trigger function as 005 with the final columns added; nothing else changes.
create or replace function public.log_athlete_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  ch jsonb := '[]'::jsonb;
  f text;
  i int;
  n int;
  ov text;
  nv text;
  uid uuid := auth.uid();
  em text := auth.jwt() ->> 'email';
begin
  if tg_op = 'INSERT' then
    insert into public.athlete_log (athlete_id, competition_id, athlete_name, action, changed_by, changed_by_email)
    values (new.id, new.competition_id, new.name, 'insert', uid, em);
    return new;
  elsif tg_op = 'DELETE' then
    insert into public.athlete_log (athlete_id, competition_id, athlete_name, action, snapshot, changed_by, changed_by_email)
    values (old.id, old.competition_id, old.name, 'delete', to_jsonb(old), uid, em);
    return old;
  end if;

  foreach f in array array['name', 'uni', 'cat', 'relay', 'lane'] loop
    ov := to_jsonb(old) ->> f;
    nv := to_jsonb(new) ->> f;
    if ov is distinct from nv then
      ch := ch || jsonb_build_array(jsonb_build_object('f', f, 'old', ov, 'new', nv));
    end if;
  end loop;

  n := greatest(coalesce(array_length(old.shots, 1), 0), coalesce(array_length(new.shots, 1), 0));
  for i in 1..n loop
    ov := coalesce(old.shots[i], '');
    nv := coalesce(new.shots[i], '');
    if ov <> nv then
      ch := ch || jsonb_build_array(jsonb_build_object('f', 'shots', 'i', i - 1, 'old', ov, 'new', nv));
    end if;
  end loop;

  n := greatest(coalesce(array_length(old.ser, 1), 0), coalesce(array_length(new.ser, 1), 0));
  for i in 1..n loop
    ov := coalesce(old.ser[i], '');
    nv := coalesce(new.ser[i], '');
    if ov <> nv then
      ch := ch || jsonb_build_array(jsonb_build_object('f', 'ser', 'i', i - 1, 'old', ov, 'new', nv));
    end if;
  end loop;

  -- final (008): start position, final shots, shoot-off shots
  ov := old.final_pos::text;
  nv := new.final_pos::text;
  if ov is distinct from nv then
    ch := ch || jsonb_build_array(jsonb_build_object('f', 'final_pos', 'old', ov, 'new', nv));
  end if;

  n := greatest(coalesce(array_length(old.final_shots, 1), 0), coalesce(array_length(new.final_shots, 1), 0));
  for i in 1..n loop
    ov := coalesce(old.final_shots[i], '');
    nv := coalesce(new.final_shots[i], '');
    if ov <> nv then
      ch := ch || jsonb_build_array(jsonb_build_object('f', 'final_shots', 'i', i - 1, 'old', ov, 'new', nv));
    end if;
  end loop;

  if old.final_so is distinct from new.final_so then
    ch := ch || jsonb_build_array(jsonb_build_object('f', 'final_so', 'old', old.final_so::text, 'new', new.final_so::text));
  end if;

  if jsonb_array_length(ch) > 0 then
    insert into public.athlete_log (athlete_id, competition_id, athlete_name, action, changes, changed_by, changed_by_email)
    values (new.id, new.competition_id, new.name, 'update', ch, uid, em);
  end if;
  return new;
end;
$$;
revoke all on function public.log_athlete_change() from public, anon, authenticated;
