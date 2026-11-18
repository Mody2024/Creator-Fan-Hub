-- Raye2 Wave 5 group spaces depth: public discovery and group detail.
--
-- Groups only existed inside the authenticated Raye2 spaces client, which loaded public
-- groups with a flat select (no member counts, no activity signal) and had no shareable
-- public surface. These read-only RPCs back a public /groups directory and a group detail
-- page while keeping private groups invisible to non-members.
--
-- All three are SECURITY DEFINER and STABLE, pinned to an empty search_path. The listing
-- and detail RPCs are granted to anon + authenticated and never expose private groups to
-- non-members; the roster RPC is authenticated-only and returns rows only to members.

-- Public group directory: public, joinable groups with member and message counts, last
-- activity and owner attribution, newest activity first, with an optional name/description
-- search.
create or replace function public.raye2_list_public_groups(
  p_limit integer default 40,
  p_search text default null
)
returns table (
  id uuid,
  slug text,
  name text,
  description text,
  topics text[],
  member_count bigint,
  message_count bigint,
  last_activity_at timestamptz,
  owner_handle text,
  owner_display_name text
)
language sql
stable
security definer
set search_path = ''
as $fn$
  with bounded as (
    select least(greatest(coalesce(p_limit, 40), 1), 100) as lim
  ),
  candidates as (
    select g.*
    from public.raye2_groups g
    cross join bounded b
    where g.visibility = 'public'
      and g.status in ('active', 'read_only')
      and (g.expires_at is null or g.expires_at > now())
      and (
        p_search is null
        or btrim(p_search) = ''
        or g.name ilike '%' || btrim(p_search) || '%'
        or g.description ilike '%' || btrim(p_search) || '%'
      )
    order by g.last_activity_at desc
    limit (select lim from bounded)
  ),
  members as (
    select m.group_id, count(*) as member_count
    from public.raye2_group_members m
    where m.status = 'active' and m.group_id in (select id from candidates)
    group by m.group_id
  ),
  messages as (
    select msg.conversation_id, count(*) as message_count
    from public.raye2_messages msg
    where msg.deleted_at is null
      and (msg.expires_at is null or msg.expires_at > now())
      and msg.conversation_id in (select conversation_id from candidates where conversation_id is not null)
    group by msg.conversation_id
  )
  select c.id,
         c.slug,
         c.name,
         c.description,
         c.topics,
         coalesce(mem.member_count, 0) as member_count,
         coalesce(msg.message_count, 0) as message_count,
         c.last_activity_at,
         mp.handle as owner_handle,
         mp.display_name as owner_display_name
  from candidates c
  left join members mem on mem.group_id = c.id
  left join messages msg on msg.conversation_id = c.conversation_id
  left join public.member_profiles mp on mp.user_id = c.owner_id
  order by c.last_activity_at desc;
$fn$;
revoke all on function public.raye2_list_public_groups(integer,text) from public;
grant execute on function public.raye2_list_public_groups(integer,text) to anon, authenticated;

-- Group detail: one group by slug, with counts, owner attribution and the caller's own
-- membership (role/status) when signed in. Private groups are only returned to members.
create or replace function public.raye2_get_group(
  p_slug text
)
returns table (
  id uuid,
  slug text,
  name text,
  description text,
  visibility text,
  status text,
  topics text[],
  rules text,
  image_url text,
  member_count bigint,
  message_count bigint,
  created_at timestamptz,
  last_activity_at timestamptz,
  owner_handle text,
  owner_display_name text,
  my_role text,
  my_status text
)
language sql
stable
security definer
set search_path = ''
as $fn$
  with target as (
    select g.*
    from public.raye2_groups g
    where g.slug = lower(btrim(coalesce(p_slug, '')))
  ),
  visible as (
    select t.*
    from target t
    where (t.visibility = 'public' and t.status in ('active', 'read_only'))
       or public.raye2_is_group_member(t.id)
       or public.raye2_is_group_manager(t.id)
  ),
  members as (
    select m.group_id, count(*) as member_count
    from public.raye2_group_members m
    where m.status = 'active' and m.group_id in (select id from visible)
    group by m.group_id
  ),
  messages as (
    select msg.conversation_id, count(*) as message_count
    from public.raye2_messages msg
    where msg.deleted_at is null
      and (msg.expires_at is null or msg.expires_at > now())
      and msg.conversation_id in (select conversation_id from visible where conversation_id is not null)
    group by msg.conversation_id
  )
  select v.id,
         v.slug,
         v.name,
         v.description,
         v.visibility,
         v.status,
         v.topics,
         v.rules,
         v.image_url,
         coalesce(mem.member_count, 0) as member_count,
         coalesce(msg.message_count, 0) as message_count,
         v.created_at,
         v.last_activity_at,
         mp.handle as owner_handle,
         mp.display_name as owner_display_name,
         mine.role as my_role,
         mine.status as my_status
  from visible v
  left join members mem on mem.group_id = v.id
  left join messages msg on msg.conversation_id = v.conversation_id
  left join public.member_profiles mp on mp.user_id = v.owner_id
  left join public.raye2_group_members mine
    on mine.group_id = v.id and mine.user_id = (select auth.uid());
$fn$;
revoke all on function public.raye2_get_group(text) from public;
grant execute on function public.raye2_get_group(text) to anon, authenticated;

-- Group roster: active members of a group the caller belongs to. Returns nothing to
-- non-members so the roster never leaks, even though the function is SECURITY DEFINER.
create or replace function public.raye2_get_group_members(
  p_group_id uuid,
  p_limit integer default 100
)
returns table (
  user_id uuid,
  role text,
  status text,
  joined_at timestamptz,
  handle text,
  display_name text,
  avatar_url text
)
language sql
stable
security definer
set search_path = ''
as $fn$
  with bounded as (
    select least(greatest(coalesce(p_limit, 100), 1), 200) as lim
  ),
  allowed as (
    select p_group_id as group_id
    where public.raye2_is_group_member(p_group_id) or public.raye2_is_group_manager(p_group_id)
  )
  select m.user_id,
         m.role,
         m.status,
         m.joined_at,
         mp.handle,
         mp.display_name,
         mp.avatar_url
  from public.raye2_group_members m
  cross join bounded b
  join allowed a on a.group_id = m.group_id
  left join public.member_profiles mp on mp.user_id = m.user_id
  where m.status = 'active'
  order by case m.role when 'owner' then 0 when 'admin' then 1 when 'moderator' then 2 else 3 end asc,
           m.joined_at asc
  limit (select lim from bounded);
$fn$;
revoke all on function public.raye2_get_group_members(uuid,integer) from public, anon;
grant execute on function public.raye2_get_group_members(uuid,integer) to authenticated;

notify pgrst, 'reload schema';
