-- TU Shooting Scoreboard — schema
-- Everyone (anon) can READ. Only users listed in public.staff can WRITE.

create table if not exists public.staff (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists public.competitions (
  id         uuid primary key default gen_random_uuid(),
  name       text not null default 'การแข่งขันใหม่',
  event      text not null default 'ap60',          -- key of EVENTS in js/scoring.js
  team_size  int  not null default 3 check (team_size between 1 and 6),
  is_active  boolean not null default false,          -- the one shown on the public scoreboard
  created_at timestamptz not null default now()
);

create table if not exists public.athletes (
  id             uuid primary key default gen_random_uuid(),
  competition_id uuid not null references public.competitions(id) on delete cascade,
  name           text not null,
  uni            text not null default '',
  cat            text not null default 'W' check (cat in ('W','M')),
  relay          text not null default '',
  lane           text not null default '',
  shots          text[] not null default '{}',        -- per-shot entry: '10', 'X', '10.4'
  ser            text[] not null default '{}',        -- per-series entry: '89-1x', '102.4'
  updated_at     timestamptz not null default now()
);
create index if not exists athletes_competition_idx on public.athletes(competition_id);

-- staff check used by policies
create or replace function public.is_staff()
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (select 1 from public.staff where user_id = (select auth.uid()));
$$;
revoke all on function public.is_staff() from public, anon;
grant execute on function public.is_staff() to authenticated;

create or replace function public.touch_updated_at()
returns trigger language plpgsql set search_path = '' as $$
begin new.updated_at = now(); return new; end $$;
drop trigger if exists athletes_touch on public.athletes;
create trigger athletes_touch before update on public.athletes
  for each row execute function public.touch_updated_at();

-- RLS
alter table public.staff        enable row level security;
alter table public.competitions enable row level security;
alter table public.athletes     enable row level security;

-- grants (new tables are not auto-exposed)
grant select on public.competitions, public.athletes to anon, authenticated;
grant insert, update, delete on public.competitions, public.athletes to authenticated;
grant select on public.staff to authenticated;

-- public read
create policy "read competitions" on public.competitions for select to anon, authenticated using (true);
create policy "read athletes"     on public.athletes     for select to anon, authenticated using (true);

-- staff write
create policy "staff insert competitions" on public.competitions for insert to authenticated with check ((select public.is_staff()));
create policy "staff update competitions" on public.competitions for update to authenticated using ((select public.is_staff())) with check ((select public.is_staff()));
create policy "staff delete competitions" on public.competitions for delete to authenticated using ((select public.is_staff()));
create policy "staff insert athletes" on public.athletes for insert to authenticated with check ((select public.is_staff()));
create policy "staff update athletes" on public.athletes for update to authenticated using ((select public.is_staff())) with check ((select public.is_staff()));
create policy "staff delete athletes" on public.athletes for delete to authenticated using ((select public.is_staff()));

-- a signed-in user can see only their own staff row (lets the page know if they are staff)
create policy "see own staff row" on public.staff for select to authenticated using (user_id = (select auth.uid()));

-- realtime
alter publication supabase_realtime add table public.competitions, public.athletes;
