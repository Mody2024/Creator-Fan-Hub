-- Raye2 Wave 4: unified creator content library (plan 4.2).
--
-- Plan 4.2 lists the content library and its states (draft, published, scheduled, expired, taken down). Each
-- state was computed somewhere else and no surface let a creator see them together. This adds one owner-scoped,
-- read-only RPC that derives the state of every owned long video so the Studio can offer a single filterable
-- view. It never exposes another owner's content and never returns the moderation trail of others.

-- 1. A stable, owner-only moderation flag. Mirrors the read-policy check on raye2_content_takedowns without
--    granting table access to creators.
create or replace function public.raye2_media_is_taken_down(p_media_id uuid)
returns boolean language sql stable security definer set search_path=''
as $$
  select exists(
    select 1 from public.raye2_content_takedowns t
    where t.target_type = 'media_item' and t.target_id = p_media_id and t.status = 'active'
  );
$$;
revoke all on function public.raye2_media_is_taken_down(uuid) from public,anon;
grant execute on function public.raye2_media_is_taken_down(uuid) to authenticated;

-- 2. One row per owned long video with a derived state.
create or replace function public.raye2_creator_content_library()
returns table (
  media_id uuid, title text, media_type text, slug text, category text,
  is_published boolean, processing_status text,
  published_at timestamptz, publish_at timestamptz, expires_at timestamptz,
  taken_down boolean, state text,
  view_count bigint, reaction_count bigint, comment_count bigint
)
language sql stable security definer set search_path=''
as $$
  with mine as (
    select m.id as media_id, m.title, m.media_type, m.is_published, m.processing_status, m.created_at,
           v.slug, v.category, v.published_at, v.publish_at, v.expires_at
    from public.media_items m
    join public.video_catalog v on v.media_id = m.id
    where m.owner_id = auth.uid()
      and m.media_type in ('video','youtube')
  )
  select m.media_id, m.title, m.media_type, m.slug, m.category,
         m.is_published, m.processing_status,
         m.published_at, m.publish_at, m.expires_at,
         public.raye2_media_is_taken_down(m.media_id) as taken_down,
         case
           when public.raye2_media_is_taken_down(m.media_id) then 'taken_down'
           when m.media_type <> 'youtube' and m.processing_status is distinct from 'ready' then 'processing'
           when m.published_at is null and m.publish_at is not null then 'scheduled'
           when m.published_at is null then 'draft'
           when m.expires_at is not null and m.expires_at <= now() then 'expired'
           else 'published'
         end as state,
         (select count(*) from public.video_views vv where vv.media_id = m.media_id) as view_count,
         (select count(*) from public.video_reactions vr where vr.media_id = m.media_id) as reaction_count,
         (select count(*) from public.video_comments vc where vc.media_id = m.media_id) as comment_count
  from mine m
  order by m.created_at desc, m.media_id desc;
$$;
revoke all on function public.raye2_creator_content_library() from public,anon;
grant execute on function public.raye2_creator_content_library() to authenticated;

notify pgrst, 'reload schema';
