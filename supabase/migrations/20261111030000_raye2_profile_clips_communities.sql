-- Raye2 Wave 2: profile community clips and public communities surfaces (plan 2.1 / 13.7).
--
-- Plan 13.7 requires profile surfaces to connect to "community posts/clips, public communities,
-- playlists/collections and achievements". Clips and public communities were still missing from the member
-- profile. This extends the existing privacy-gated collections RPC so the profile can render both, applying
-- the same visibility, block and expiry rules the standalone feeds use.

create or replace function public.raye2_get_profile_collections(p_handle text, p_limit integer default 24)
returns jsonb
language sql stable security definer set search_path = ''
as $fn$
  with me as (select (select auth.uid()) as uid),
  bounded as (select least(greatest(coalesce(p_limit, 24), 1), 60) as lim),
  target as (
    select mp.user_id
    from public.member_profiles mp, me
    where mp.handle = lower(btrim(coalesce(p_handle, '')))
      and (
        (mp.visibility = 'public' and not public.is_member_blocked(mp.user_id))
        or mp.user_id = me.uid
        or exists (select 1 from public.member_blocks b where b.blocker_id = me.uid and b.blocked_id = mp.user_id)
      )
  ),
  moments as (
    select cp.id::text as id, cp.body, cp.created_at, cp.expires_at,
           (select count(*) from public.community_reactions r where r.post_id = cp.id)::bigint as reaction_count
    from public.community_posts cp
    join target t on t.user_id = cp.author_id
    cross join bounded b
    where cp.is_moment = true and cp.status = 'published'
      and (cp.expires_at is null or cp.expires_at > now())
    order by cp.created_at desc
    limit (select lim from bounded)
  ),
  playlists as (
    select p.id::text as id, p.slug, p.title, p.description,
           (select count(*) from public.video_playlist_items i where i.playlist_id = p.id)::bigint as item_count,
           p.updated_at
    from public.video_playlists p
    join target t on t.user_id = p.owner_id
    cross join bounded b
    where p.is_published = true
    order by p.position asc, p.updated_at desc
    limit (select lim from bounded)
  ),
  clips as (
    select c.id::text as id, c.title, c.caption, c.storage_path, c.duration_seconds, c.created_at, c.expires_at,
           c.attribution_text, vc.slug as source_slug, c.source_title
    from public.raye2_community_clips c
    join target t on t.user_id = c.clipper_id
    cross join bounded b
    left join public.video_catalog vc on vc.media_id = c.source_media_id
    where c.status = 'published' and c.visibility = 'public' and c.expires_at > now()
      and not public.is_member_blocked(c.clipper_id)
    order by c.created_at desc
    limit (select lim from bounded)
  ),
  communities as (
    select g.id::text as id, g.slug, g.name, g.description, g.topics,
           (select count(*) from public.raye2_group_members m where m.group_id = g.id and m.status = 'active')::bigint as member_count
    from public.raye2_group_members gm
    join target t on t.user_id = gm.user_id
    join public.raye2_groups g on g.id = gm.group_id
    cross join bounded b
    where gm.status = 'active' and g.visibility = 'public' and g.status = 'active'
    order by g.last_activity_at desc
    limit (select lim from bounded)
  )
  select jsonb_build_object(
    'moments', coalesce((select jsonb_agg(to_jsonb(m)) from moments m), '[]'::jsonb),
    'playlists', coalesce((select jsonb_agg(to_jsonb(p)) from playlists p), '[]'::jsonb),
    'clips', coalesce((select jsonb_agg(to_jsonb(c)) from clips c), '[]'::jsonb),
    'communities', coalesce((select jsonb_agg(to_jsonb(c) order by c.name) from communities c), '[]'::jsonb)
  );
$fn$;
revoke all on function public.raye2_get_profile_collections(text,integer) from public, anon;
grant execute on function public.raye2_get_profile_collections(text,integer) to anon, authenticated;

notify pgrst, 'reload schema';
