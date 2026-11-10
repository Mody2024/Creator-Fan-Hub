-- Raye2 Wave 3 discovery depth: series and collections.
--
-- The series index ran one count query per playlist (N+1) and the detail page silently
-- dropped external YouTube episodes and was English-only. These read-only RPCs give both
-- surfaces real data: playable counts, total runtime, cover art and creator attribution.
--
-- Both are SECURITY DEFINER, STABLE, pinned to an empty search_path, granted to
-- anon + authenticated, and only ever expose published playlists and published videos.

-- Series index: every published playlist with its real playable video count, total
-- runtime and a cover image taken from its first playable item.
create or replace function public.raye2_list_series(
  p_limit integer default 40
)
returns table (
  slug text,
  title text,
  description text,
  "position" integer,
  video_count bigint,
  total_duration_seconds bigint,
  cover_path text,
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
  playable as (
    select vpi.playlist_id,
           vpi.position,
           vpi.media_id,
           vc.slug as video_slug,
           vc.duration_seconds,
           vc.thumbnail_media_id,
           mi.owner_id
    from public.video_playlist_items vpi
    join public.video_catalog vc on vc.media_id = vpi.media_id
    join public.media_items mi on mi.id = vpi.media_id
    where mi.is_published = true
      and mi.media_type in ('video', 'youtube')
      and vc.published_at is not null
  ),
  aggregated as (
    select p.playlist_id,
           count(*) as video_count,
           coalesce(sum(p.duration_seconds), 0) as total_duration_seconds,
           (array_agg(p.thumbnail_media_id order by p.position))[1] as cover_media_id,
           (array_agg(p.owner_id order by p.position))[1] as owner_id
    from playable p
    group by p.playlist_id
  )
  select pl.slug,
         pl.title,
         pl.description,
         pl.position,
         coalesce(a.video_count, 0) as video_count,
         coalesce(a.total_duration_seconds, 0) as total_duration_seconds,
         cover.storage_path as cover_path,
         mp.handle as owner_handle,
         mp.display_name as owner_display_name
  from public.video_playlists pl
  cross join bounded b
  left join aggregated a on a.playlist_id = pl.id
  left join public.media_items cover
    on cover.id = a.cover_media_id
   and cover.is_published = true
   and cover.media_type = 'image'
   and cover.storage_path like 'creator-media-public/%'
  left join public.member_profiles mp on mp.user_id = a.owner_id
  where pl.is_published = true
    and coalesce(a.video_count, 0) > 0
  order by pl.position asc, pl.created_at asc
  limit (select lim from bounded);
$fn$;
revoke all on function public.raye2_list_series(integer) from public;
grant execute on function public.raye2_list_series(integer) to anon, authenticated;

-- Series detail: the ordered episodes of one published playlist, external embeds included.
create or replace function public.raye2_get_series(
  p_slug text,
  p_limit integer default 100
)
returns table (
  playlist_slug text,
  playlist_title text,
  playlist_description text,
  video_slug text,
  title text,
  category text,
  description text,
  media_type text,
  duration_seconds integer,
  "position" integer
)
language sql
stable
security definer
set search_path = ''
as $fn$
  with bounded as (
    select least(greatest(coalesce(p_limit, 100), 1), 200) as lim
  ),
  target as (
    select pl.id, pl.slug, pl.title, pl.description
    from public.video_playlists pl
    where pl.slug = lower(btrim(coalesce(p_slug, '')))
      and pl.is_published = true
  )
  select t.slug,
         t.title,
         t.description,
         vc.slug,
         mi.title,
         vc.category,
         vc.description,
         mi.media_type,
         vc.duration_seconds,
         vpi.position
  from target t
  join public.video_playlist_items vpi on vpi.playlist_id = t.id
  join public.video_catalog vc on vc.media_id = vpi.media_id
  join public.media_items mi on mi.id = vpi.media_id
  cross join bounded b
  where mi.is_published = true
    and mi.media_type in ('video', 'youtube')
    and vc.published_at is not null
  order by vpi.position asc
  limit (select lim from bounded);
$fn$;
revoke all on function public.raye2_get_series(text,integer) from public;
grant execute on function public.raye2_get_series(text,integer) to anon, authenticated;

notify pgrst, 'reload schema';
