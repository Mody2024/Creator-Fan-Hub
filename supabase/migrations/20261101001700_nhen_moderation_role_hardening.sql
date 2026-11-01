-- Restrict moderation writes to explicitly authorized community moderators.
create or replace function public.can_moderate_community()
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

revoke all on function public.can_moderate_community() from public, anon;
grant execute on function public.can_moderate_community() to authenticated;

drop policy if exists "Creators moderate posts" on public.community_posts;
create policy "Authorized moderators manage posts"
on public.community_posts for all to authenticated
using (public.can_moderate_community())
with check (public.can_moderate_community());

drop policy if exists "Creators moderate comments" on public.community_comments;
create policy "Authorized moderators manage comments"
on public.community_comments for all to authenticated
using (public.can_moderate_community())
with check (public.can_moderate_community());

drop policy if exists "Creators review reports" on public.content_reports;
create policy "Authorized moderators review reports"
on public.content_reports for select to authenticated
using (public.can_moderate_community());

drop policy if exists "Creators update reports" on public.content_reports;
create policy "Authorized moderators update reports"
on public.content_reports for update to authenticated
using (public.can_moderate_community())
with check (public.can_moderate_community());
