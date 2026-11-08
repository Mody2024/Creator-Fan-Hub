-- Raye2 creator achievement insights: aggregate-only reporting for authorized creator workspace members.
create or replace function public.raye2_creator_achievement_insights()
returns table (
  achievement_code text,
  title text,
  description text,
  icon text,
  earned_count bigint,
  member_count bigint
)
language plpgsql
stable
security definer
set search_path=''
as $$
begin
  if not exists (
    select 1 from public.creator_admins ca
    where ca.user_id=(select auth.uid())
      and ca.active=true
      and ca.role in ('owner','admin','creator','editor','analyst')
  ) then
    raise exception 'creator workspace access required' using errcode='42501';
  end if;

  return query
  select a.code,a.title,a.description,a.icon,
    count(ma.user_id)::bigint,
    count(distinct ma.user_id)::bigint
  from public.achievement_catalog a
  left join public.member_achievements ma on ma.achievement_code=a.code
  group by a.code,a.title,a.description,a.icon,a.position
  order by a.position,a.code;
end;
$$;
revoke all on function public.raye2_creator_achievement_insights() from public,anon;
grant execute on function public.raye2_creator_achievement_insights() to authenticated;
