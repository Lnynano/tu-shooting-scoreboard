-- Atomically make exactly one competition active. SECURITY INVOKER, so RLS still limits it to staff.
create or replace function public.set_active_competition(cid uuid)
returns void
language sql
security invoker
set search_path = ''
as $$
  update public.competitions set is_active = (id = cid) where is_active or id = cid;
$$;
revoke all on function public.set_active_competition(uuid) from public, anon;
grant execute on function public.set_active_competition(uuid) to authenticated;
