-- Raye2 social graph: transactional follow/block, follower and following lists,
-- mutual-follower discovery and block-aware suggestions.
--
-- Why RPCs: the previous flow did two sequential client-side writes (block insert,
-- then follow delete) and compensated by hand on failure, and suggestions could
-- include members the viewer had blocked. Moving these into guarded SECURITY DEFINER
-- functions makes each relationship change atomic and keeps block enforcement in one
-- server-side place.

create or replace function public.raye2_toggle_follow(p_target_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_me uuid := (select auth.uid());
  v_now_following boolean;
begin
  if v_me is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;
  if p_target_id is null or p_target_id = v_me then
    raise exception 'invalid follow target' using errcode = '22023';
  end if;
  if not exists (select 1 from public.member_profiles where user_id = p_target_id) then
    raise exception 'member not found' using errcode = '22023';
  end if;
  if public.is_member_blocked(p_target_id) then
    raise exception 'a block is in effect for this member' using errcode = '42501';
  end if;

  if exists (
    select 1 from public.member_follows
    where follower_id = v_me and followed_id = p_target_id
  ) then
    delete from public.member_follows
    where follower_id = v_me and followed_id = p_target_id;
    v_now_following := false;
  else
    insert into public.member_follows(follower_id, followed_id)
    values (v_me, p_target_id)
    on conflict (follower_id, followed_id) do nothing;
    v_now_following := true;
  end if;
  return v_now_following;
end;
$fn$;
revoke all on function public.raye2_toggle_follow(uuid) from public, anon;
grant execute on function public.raye2_toggle_follow(uuid) to authenticated;

-- Atomic block/unblock. Blocking removes any follow in either direction so the
-- relationship is fully severed; unblocking leaves no follow behind.
create or replace function public.raye2_toggle_block(p_target_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_me uuid := (select auth.uid());
  v_now_blocked boolean;
begin
  if v_me is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;
  if p_target_id is null or p_target_id = v_me then
    raise exception 'invalid block target' using errcode = '22023';
  end if;
  if not exists (select 1 from public.member_profiles where user_id = p_target_id) then
    raise exception 'member not found' using errcode = '22023';
  end if;

  if exists (
    select 1 from public.member_blocks
    where blocker_id = v_me and blocked_id = p_target_id
  ) then
    delete from public.member_blocks
    where blocker_id = v_me and blocked_id = p_target_id;
    v_now_blocked := false;
  else
    insert into public.member_blocks(blocker_id, blocked_id)
    values (v_me, p_target_id)
    on conflict (blocker_id, blocked_id) do nothing;
    delete from public.member_follows
    where (follower_id = v_me and followed_id = p_target_id)
       or (follower_id = p_target_id and followed_id = v_me);
    v_now_blocked := true;
  end if;
  return v_now_blocked;
end;
$fn$;
revoke all on function public.raye2_toggle_block(uuid) from public, anon;
grant execute on function public.raye2_toggle_block(uuid) to authenticated;

-- Public follower/following lists. Block relationships are hidden from both sides
-- using a symmetric block predicate (not is_member_blocked, which is viewer-specific).
create or replace function public.raye2_get_member_connections(
  p_user_id uuid,
  p_kind text,
  p_limit integer default 60
)
returns table (user_id uuid, handle text, display_name text, avatar_url text)
language plpgsql
security definer
set search_path = ''
as $fn$
#variable_conflict use_column
declare
  v_limit integer := least(greatest(coalesce(p_limit, 60), 1), 100);
begin
  if p_kind not in ('followers', 'following') then
    raise exception 'invalid connection kind' using errcode = '22023';
  end if;
  if p_user_id is null or not exists (select 1 from public.member_profiles where user_id = p_user_id) then
    raise exception 'member not found' using errcode = '22023';
  end if;
  return query
    select p.user_id, p.handle, p.display_name, p.avatar_url
    from (
      select case when p_kind = 'followers' then f.follower_id else f.followed_id end as uid, f.created_at
      from public.member_follows f
      where (p_kind = 'followers' and f.followed_id = p_user_id)
         or (p_kind = 'following' and f.follower_id = p_user_id)
    ) rel
    join public.member_profiles p on p.user_id = rel.uid
    where p.visibility = 'public'
      and not exists (
        select 1 from public.member_blocks b
        where (b.blocker_id = p_user_id and b.blocked_id = p.user_id)
           or (b.blocker_id = p.user_id and b.blocked_id = p_user_id)
      )
    order by rel.created_at desc
    limit v_limit;
end;
$fn$;
revoke all on function public.raye2_get_member_connections(uuid,text,integer) from public, anon;
grant execute on function public.raye2_get_member_connections(uuid,text,integer) to authenticated;

-- Members the viewer follows who also follow the profile being viewed (mutual followers).
create or replace function public.raye2_get_mutual_followers(p_user_id uuid, p_limit integer default 30)
returns table (user_id uuid, handle text, display_name text, avatar_url text)
language plpgsql
security definer
set search_path = ''
as $fn$
#variable_conflict use_column
declare
  v_me uuid := (select auth.uid());
  v_limit integer := least(greatest(coalesce(p_limit, 30), 1), 60);
begin
  if v_me is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;
  if p_user_id is null then
    raise exception 'member not found' using errcode = '22023';
  end if;
  return query
    select p.user_id, p.handle, p.display_name, p.avatar_url
    from public.member_follows me
    join public.member_follows them on them.follower_id = me.followed_id
    join public.member_profiles p on p.user_id = me.followed_id
    where me.follower_id = v_me
      and them.followed_id = p_user_id
      and p.user_id <> v_me
      and p.visibility = 'public'
      and not exists (
        select 1 from public.member_blocks b
        where (b.blocker_id = v_me and b.blocked_id = p.user_id)
           or (b.blocker_id = p.user_id and b.blocked_id = v_me)
      )
    order by p.display_name asc
    limit v_limit;
end;
$fn$;
revoke all on function public.raye2_get_mutual_followers(uuid,integer) from public, anon;
grant execute on function public.raye2_get_mutual_followers(uuid,integer) to authenticated;

-- Suggestions ranked by shared followers, then recency. Excludes the viewer, blocked
-- members (either direction) and anyone already followed.
create or replace function public.raye2_suggest_members(p_limit integer default 12)
returns table (user_id uuid, handle text, display_name text, avatar_url text, mutual_count integer)
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_me uuid := (select auth.uid());
  v_limit integer := least(greatest(coalesce(p_limit, 12), 1), 48);
begin
  if v_me is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;
  return query
    select p.user_id, p.handle, p.display_name, p.avatar_url, coalesce(m.mutual_count, 0) as mutual_count
    from public.member_profiles p
    left join (
      select f.followed_id as uid, count(*)::integer as mutual_count
      from public.member_follows f
      where f.follower_id in (
        select followed_id from public.member_follows where follower_id = v_me
      )
      group by f.followed_id
    ) m on m.uid = p.user_id
    where p.user_id <> v_me
      and p.visibility = 'public'
      and not exists (
        select 1 from public.member_follows f
        where f.follower_id = v_me and f.followed_id = p.user_id
      )
      and not exists (
        select 1 from public.member_blocks b
        where (b.blocker_id = v_me and b.blocked_id = p.user_id)
           or (b.blocker_id = p.user_id and b.blocked_id = v_me)
      )
    order by coalesce(m.mutual_count, 0) desc, p.updated_at desc
    limit v_limit;
end;
$fn$;
revoke all on function public.raye2_suggest_members(integer) from public, anon;
grant execute on function public.raye2_suggest_members(integer) to authenticated;
