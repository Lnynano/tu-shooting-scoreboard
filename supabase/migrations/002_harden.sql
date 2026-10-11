-- Advisor fix: rls_auto_enable() is an event-trigger helper; it must not be callable through the API.
-- (is_staff() stays executable by `authenticated` on purpose: RLS policies call it as the signed-in user.)
do $$ begin
  if to_regprocedure('public.rls_auto_enable()') is not null then
    revoke all on function public.rls_auto_enable() from public, anon, authenticated;
  end if;
end $$;
