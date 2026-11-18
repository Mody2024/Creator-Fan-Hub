-- Raye2 Wave 3: keyset pagination for the watch library.
--
-- Plan 3.1 requires feed/discovery pagination without duplicate or missing items. The /watch library
-- loaded a single window of 60 videos and stopped, so older videos were unreachable. This adds a
-- keyset (cursor) page function over the accessible catalog, ordered by published_at desc, media_id desc.
--
-- Access is decided by raye2_can_view_video (published, exclusivity and expiry), so the page can never
-- surface an exclusive or expired video. The cursor is the (published_at, media_id) of the last row.

create or replace function public.raye2_get_watch_library_page(
  p_limit integer default 24,
  p_before timestamptz default null,
  p_before_id uuid default null
)
returns table (
  media_id uuid,
  slug text,
  title text,
  description text,
  category text,
  tags text[],
  published_at timestamptz,
  media_type text,
  storage_path text,
  source_url text,
  processing_status text,
  thumbnail_path text,
  alt_text text
)
language sql
stable
security definer
set search_path = ''
as $fn$
  with bounded as (
    select least(greatest(coalesce(p_limit, 24), 1), 48) as lim
  )
  select vc.media_id,
         vc.slug,
         mi.title,
         vc.description,
         vc.category,
         vc.tags,
         vc.published_at,
         mi.media_type,
         mi.storage_path,
         mi.source_url,
         mi.processing_status,
         mi.thumbnail_path,
         mi.alt_text
  from public.video_catalog vc
  join public.media_items mi on mi.id = vc.media_id
  cross join bounded b
  where public.raye2_can_view_video(vc.media_id)
    and mi.is_published = true
    and mi.media_type in ('video','youtube')
    and vc.published_at is not null
    and (mi.media_type <> 'video' or mi.processing_status = 'ready')
    and (p_before is null or (vc.published_at, vc.media_id) < (p_before, coalesce(p_before_id, '00000000-0000-0000-0000-000000000000'::uuid)))
  order by vc.published_at desc, vc.media_id desc
  limit (select lim from bounded);
$fn$;
revoke all on function public.raye2_get_watch_library_page(integer,timestamptz,uuid) from public;
grant execute on function public.raye2_get_watch_library_page(integer,timestamptz,uuid) to anon, authenticated;

notify pgrst, 'reload schema';
