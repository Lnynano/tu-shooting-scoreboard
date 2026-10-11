-- Change history: every insert / update / delete on athletes is recorded by a trigger
-- (who, when, what changed: old -> new). Only staff can read it; nobody can write to it directly.
create table if not exists public.athlete_log (
  id               bigint generated always as identity primary key,
  athlete_id       uuid not null,
  competition_id   uuid not null,
  athlete_name     text not null,
  action           text not null check (action in ('insert', 'update', 'delete')),
  changes          jsonb not null default '[]'::jsonb,   -- [{"f":"ser","i":0,"old":"90","new":"91"}, {"f":"lane","old":"1","new":"2"}]
  snapshot         jsonb,                                 -- full old row, kept on delete so it can be restored
  changed_by       uuid,
  changed_by_email text,
  changed_at       timestamptz not null default now()
);
create index if not exists athlete_log_comp_idx    on public.athlete_log (competition_id, changed_at desc);
create index if not exists athlete_log_athlete_idx on public.athlete_log (athlete_id, changed_at desc);

alter table public.athlete_log enable row level security;
grant select on public.athlete_log to authenticated;
create policy "staff read athlete log" on public.athlete_log for select to authenticated using ((select public.is_staff()));

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

  if jsonb_array_length(ch) > 0 then
    insert into public.athlete_log (athlete_id, competition_id, athlete_name, action, changes, changed_by, changed_by_email)
    values (new.id, new.competition_id, new.name, 'update', ch, uid, em);
  end if;
  return new;
end;
$$;
revoke all on function public.log_athlete_change() from public, anon, authenticated;

drop trigger if exists athletes_log on public.athletes;
create trigger athletes_log after insert or update or delete on public.athletes
  for each row execute function public.log_athlete_change();
