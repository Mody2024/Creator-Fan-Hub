-- Raye2 Wave 6 watch depth: creator attribution and series context.
--
-- The watch page never showed who made the video, never offered a follow action, and never
-- told the viewer that the video belongs to a series. This read RPC gives the page one row
-- of creator identity (with follower count and the viewer's follow state) plus the first
-- published playlist the video belongs to, so the player can link into /series and /u.
--
-- SECURITY DEFINER, STABLE, pinned to an empty search_path, granted to anon + authenticated.
-- A creator the viewer blocked (in either direction) is withheld, matching profile RLS.

create or replace function public.raye2_get_watch_context(
  p_slug text
)
returns table (
  creator_user_id uuid,
  creator_handle text,
  creator_display_name text,
  creator_avatar_url text,
  follower_count bigint,
  is_following boolean,
  series_slug text,
  series_title text,
  series_position integer,
  series_episode_count bigint
)
language sql
stable
security definer
set search_path = ''
as $fn$
  with target as (
    select vc.media_id, mi.owner_id
    from public.video_catalog vc
    join public.media_items mi on mi.id = vc.media_id
    where vc.slug = lower(btrim(coalesce(p_slug, '')))
      and mi.is_published = true
      and mi.media_type in ('video', 'youtube')
      and vc.published_at is not null
  ),
  visible as (
    select t.media_id, t.owner_id
    from target t
    where t.owner_id is not null
      and not public.is_member_blocked(t.owner_id)
  ),
  series_pick as (
    select pl.id, pl.slug, pl.title, vpi.position
    from visible v
    join public.video_playlist_items vpi on vpi.media_id = v.media_id
    join public.video_playlists pl on pl.id = vpi.playlist_id and pl.is_published = true
    order by pl.position asc, vpi.position asc, pl.created_at asc
    limit 1
  ),
  series_episodes as (
    select sp.id,
           (select count(*)
              from public.video_playlist_items i
              join public.video_catalog v on v.media_id = i.media_id
              join public.media_items m on m.id = v.media_id
             where i.playlist_id = sp.id
               and m.is_published = true
               and m.media_type in ('video', 'youtube')
               and v.published_at is not null) as episode_count
    from series_pick sp
  )
  select v.owner_id as creator_user_id,
         mp.handle as creator_handle,
         mp.display_name as creator_display_name,
         mp.avatar_url as creator_avatar_url,
         (select count(*) from public.member_follows f where f.followed_id = v.owner_id) as follower_count,
         exists(select 1 from public.member_follows f2
                 where f2.follower_id = (select auth.uid()) and f2.followed_id = v.owner_id) as is_following,
         sp.slug as series_slug,
         sp.title as series_title,
         sp.position as series_position,
         se.episode_count as series_episode_count
  from visible v
  left join public.member_profiles mp on mp.user_id = v.owner_id
  left join series_pick sp on true
  left join series_episodes se on se.id = sp.id;
$fn$;
revoke all on function public.raye2_get_watch_context(text) from public;
grant execute on function public.raye2_get_watch_context(text) to anon, authenticated;

notify pgrst, 'reload schema';
