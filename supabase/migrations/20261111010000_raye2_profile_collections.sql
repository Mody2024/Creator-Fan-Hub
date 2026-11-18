-- Raye2 Wave 2: profile Moments and playlists/collections surfaces (plan 2.1).
--
-- Plan 2.1 requires profile surfaces for "videos, Mini's, Moments, community activity, playlists/collections
-- and achievements". Videos, Mini's, community activity and achievements were present, but a member profile
-- had no way to show their active Moments or their published playlists. This adds one privacy-gated RPC that
-- returns both, so the profile page can render the missing tabs.

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
  )
  select jsonb_build_object(
    'moments', coalesce((select jsonb_agg(to_jsonb(m)) from moments m), '[]'::jsonb),
    'playlists', coalesce((select jsonb_agg(to_jsonb(p)) from playlists p), '[]'::jsonb)
  );
$fn$;
revoke all on function public.raye2_get_profile_collections(text,integer) from public, anon;
grant execute on function public.raye2_get_profile_collections(text,integer) to anon, authenticated;

notify pgrst, 'reload schema';
