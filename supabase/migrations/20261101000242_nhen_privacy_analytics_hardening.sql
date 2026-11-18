-- NHEN privacy hardening: profile links, reaction identities and view spam.
alter table public.member_profiles
  add constraint member_profiles_website_url_check check (website_url is null or website_url ~ '^https?://'),
  add constraint member_profiles_avatar_url_check check (avatar_url is null or avatar_url ~ '^https?://');

-- Reaction identities are private; public counters are served by the aggregate RPC.
drop policy if exists "Video reactions visible" on public.video_reactions;
revoke select on public.video_reactions from anon,authenticated;
grant select on public.video_reactions to authenticated;
create policy "Members see own video reactions" on public.video_reactions for select to authenticated
using(user_id=(select auth.uid()));

-- Count at most one authenticated view per member per video. Anonymous traffic is not
-- counted because the free-tier implementation has no trustworthy anonymous dedupe key.
revoke insert on public.video_views from anon,authenticated;
drop policy if exists "Anyone may record a video view" on public.video_views;
create unique index if not exists video_views_one_per_member_idx
on public.video_views(media_id,viewer_id) where viewer_id is not null;

create or replace function public.record_video_view(p_media_id uuid)
returns void language plpgsql security definer set search_path=''
as $$
begin
 if auth.uid() is null then return; end if;
 if not exists(select 1 from public.video_catalog v join public.media_items m on m.id=v.media_id where v.media_id=p_media_id and v.published_at is not null and m.is_published=true) then
  return;
 end if;
 insert into public.video_views(media_id,viewer_id) values(p_media_id,auth.uid())
 on conflict(media_id,viewer_id) where viewer_id is not null do nothing;
end;
$$;
revoke all on function public.record_video_view(uuid) from public;
grant execute on function public.record_video_view(uuid) to anon,authenticated;
