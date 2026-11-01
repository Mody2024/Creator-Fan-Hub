-- Keep the moderation authorization helper outside exposed API schemas.
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;
grant usage on schema private to authenticated;

create or replace function private.can_moderate_community()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.creator_admins ca
    where ca.user_id = (select auth.uid())
      and ca.active = true
      and ca.role in ('owner', 'admin', 'moderator')
  );
$$;

revoke all on function private.can_moderate_community() from public, anon, authenticated;
grant execute on function private.can_moderate_community() to authenticated;

-- Table privileges are required in addition to row-level policies.
grant update on public.content_reports to authenticated;

-- Replace all policy references before removing the old exposed helper.
drop policy if exists "Creators moderate posts" on public.community_posts;
drop policy if exists "Moderators manage community posts" on public.community_posts;
create policy "Moderators manage community posts"
on public.community_posts for all to authenticated
using (private.can_moderate_community())
with check (private.can_moderate_community());

drop policy if exists "Published posts visible" on public.community_posts;
create policy "Published posts visible"
on public.community_posts for select to anon, authenticated
using (
  (
    status = 'published'
    and not public.is_member_blocked(author_id)
  )
  or author_id = (select auth.uid())
  or private.can_moderate_community()
);

drop policy if exists "Creators moderate comments" on public.community_comments;
drop policy if exists "Moderators manage community comments" on public.community_comments;
create policy "Moderators manage community comments"
on public.community_comments for all to authenticated
using (private.can_moderate_community())
with check (private.can_moderate_community());

drop policy if exists "Published comments visible" on public.community_comments;
create policy "Published comments visible"
on public.community_comments for select to anon, authenticated
using (
  (
    status = 'published'
    and not public.is_member_blocked(author_id)
    and exists (
      select 1
      from public.community_posts p
      where p.id = community_comments.post_id
        and p.status = 'published'
        and not public.is_member_blocked(p.author_id)
    )
  )
  or author_id = (select auth.uid())
  or private.can_moderate_community()
);

drop policy if exists "Creators review reports" on public.content_reports;
drop policy if exists "Moderators review reports" on public.content_reports;
create policy "Moderators review reports"
on public.content_reports for select to authenticated
using (private.can_moderate_community());

drop policy if exists "Creators update reports" on public.content_reports;
drop policy if exists "Moderators update reports" on public.content_reports;
create policy "Moderators update reports"
on public.content_reports for update to authenticated
using (private.can_moderate_community())
with check (private.can_moderate_community());

drop policy if exists "Creators moderate video comments" on public.video_comments;
drop policy if exists "Moderators manage video comments" on public.video_comments;
create policy "Moderators manage video comments"
on public.video_comments for all to authenticated
using (private.can_moderate_community())
with check (private.can_moderate_community());

drop policy if exists "Published video comments visible" on public.video_comments;
create policy "Published video comments visible"
on public.video_comments for select to anon, authenticated
using (
  (
    status = 'published'
    and not public.is_member_blocked(author_id)
    and exists (
      select 1
      from public.video_catalog v
      join public.media_items m on m.id = v.media_id
      where v.media_id = video_comments.media_id
        and v.published_at is not null
        and m.is_published = true
    )
  )
  or author_id = (select auth.uid())
  or private.can_moderate_community()
);

drop function if exists public.can_moderate_community();
