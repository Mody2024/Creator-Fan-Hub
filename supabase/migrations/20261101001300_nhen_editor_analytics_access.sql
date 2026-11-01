-- Editors may see performance data for content they manage; analysts remain read-only.
create or replace function public.can_view_creator_analytics()
returns boolean language sql stable security definer set search_path=''
as $$ select public.has_creator_role(array['owner','admin','editor','analyst']); $$;
revoke all on function public.can_view_creator_analytics() from public;
grant execute on function public.can_view_creator_analytics() to anon,authenticated;
