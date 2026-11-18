-- Raye2 Wave 3/5: "Continue watching" watch-progress persistence.
--
-- Raye2 had no way to resume a video: closing the tab lost your place. This adds a
-- private per-member watch_progress table plus guarded RPCs to record, read and clear
-- progress. Progress is member-private; nothing here is publicly readable.

create table if not exists public.watch_progress (
  user_id uuid not null references auth.users(id) on delete cascade,
  media_id uuid not null references public.video_catalog(media_id) on delete cascade,
  position_seconds integer not null default 0 check (position_seconds >= 0),
  duration_seconds integer not null default 0 check (duration_seconds >= 0),
  updated_at timestamptz not null default now(),
  primary key (user_id, media_id)
);

create index if not exists watch_progress_user_updated_idx
  on public.watch_progress(user_id, updated_at desc);

alter table public.watch_progress enable row level security;

drop policy if exists "Members read their own watch progress" on public.watch_progress;
create policy "Members read their own watch progress"
on public.watch_progress for select to authenticated
using (user_id = (select auth.uid()));

drop policy if exists "Members write their own watch progress" on public.watch_progress;
create policy "Members write their own watch progress"
on public.watch_progress for insert to authenticated
with check (user_id = (select auth.uid()));

drop policy if exists "Members update their own watch progress" on public.watch_progress;
create policy "Members update their own watch progress"
on public.watch_progress for update to authenticated
using (user_id = (select auth.uid()))
with check (user_id = (select auth.uid()));

drop policy if exists "Members delete their own watch progress" on public.watch_progress;
create policy "Members delete their own watch progress"
on public.watch_progress for delete to authenticated
using (user_id = (select auth.uid()));

-- Record (upsert) the caller's playback position for a published video. Near-the-end
-- positions are treated as finished and stored at the duration so the resume rail can
-- drop them; the position is always clamped to the media duration when known.
create or replace function public.raye2_record_watch_progress(
  p_media_id uuid,
  p_position integer,
  p_duration integer default 0
)
returns void
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_me uuid := auth.uid();
  v_published boolean;
  v_pos integer;
  v_dur integer;
begin
  if v_me is null then
    raise exception 'authentication required';
  end if;

  select (mi.is_published and mi.media_type in ('video','youtube') and vc.published_at is not null)
  into v_published
  from public.video_catalog vc
  join public.media_items mi on mi.id = vc.media_id
  where vc.media_id = p_media_id;

  if v_published is not true then
    raise exception 'video is not published';
  end if;

  v_pos := greatest(coalesce(p_position, 0), 0);
  v_dur := greatest(coalesce(p_duration, 0), 0);
  if v_dur > 0 and v_pos > v_dur then
    v_pos := v_dur;
  end if;

  insert into public.watch_progress(user_id, media_id, position_seconds, duration_seconds, updated_at)
  values (v_me, p_media_id, v_pos, v_dur, now())
  on conflict (user_id, media_id)
  do update set position_seconds = excluded.position_seconds,
                duration_seconds = excluded.duration_seconds,
                updated_at = now();
end;
$fn$;
revoke all on function public.raye2_record_watch_progress(uuid,integer,integer) from public;
grant execute on function public.raye2_record_watch_progress(uuid,integer,integer) to authenticated;

-- Return the caller's in-progress videos, most recently watched first, restricted to
-- videos that are still published. Finished items (>= 95% watched, or within 30s of the
-- end) are omitted so the rail only offers genuinely resumable videos.
create or replace function public.raye2_get_continue_watching(
  p_limit integer default 10
)
returns table (
  slug text,
  title text,
  category text,
  description text,
  position_seconds integer,
  duration_seconds integer,
  updated_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $fn$
  with bounded as (
    select least(greatest(coalesce(p_limit, 10), 1), 24) as lim
  )
  select vc.slug,
         mi.title,
         vc.category,
         vc.description,
         wp.position_seconds,
         wp.duration_seconds,
         wp.updated_at
  from public.watch_progress wp
  join public.video_catalog vc on vc.media_id = wp.media_id
  join public.media_items mi on mi.id = vc.media_id
  where wp.user_id = auth.uid()
    and mi.is_published = true
    and mi.media_type in ('video','youtube')
    and vc.published_at is not null
    and wp.position_seconds > 0
    and (
      wp.duration_seconds = 0
      or wp.position_seconds < least(wp.duration_seconds - 30, floor(wp.duration_seconds * 0.95))
    )
  order by wp.updated_at desc
  limit (select lim from bounded);
$fn$;
revoke all on function public.raye2_get_continue_watching(integer) from public;
grant execute on function public.raye2_get_continue_watching(integer) to authenticated;

-- Clear a single video's progress for the caller (used when a video is finished).
create or replace function public.raye2_clear_watch_progress(p_media_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_me uuid := auth.uid();
begin
  if v_me is null then
    raise exception 'authentication required';
  end if;
  delete from public.watch_progress where user_id = v_me and media_id = p_media_id;
end;
$fn$;
revoke all on function public.raye2_clear_watch_progress(uuid) from public;
grant execute on function public.raye2_clear_watch_progress(uuid) to authenticated;

notify pgrst, 'reload schema';
