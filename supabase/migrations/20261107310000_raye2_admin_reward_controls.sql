-- Admin-only discovery endpoint for reward administration; exposes IDs and workspace roles only.
create or replace function public.raye2_admin_list_reward_creators()
returns table(creator_id uuid,workspace_role text)
language plpgsql stable security definer set search_path=''
as $$
begin
 if not exists(select 1 from public.creator_admins ca where ca.user_id=(select auth.uid()) and ca.active=true and ca.role in ('owner','admin')) then
  raise exception 'owner or admin access required' using errcode='42501';
 end if;
 return query select ca.user_id,ca.role::text from public.creator_admins ca
  where ca.active=true and ca.role in ('creator','editor') order by ca.role,ca.user_id;
end;
$$;
revoke all on function public.raye2_admin_list_reward_creators() from public,anon,authenticated;
grant execute on function public.raye2_admin_list_reward_creators() to authenticated;
