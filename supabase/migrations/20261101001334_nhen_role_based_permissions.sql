-- Role-aware permissions for NHEN Studio.
create or replace function public.has_creator_role(p_roles text[])
returns boolean language sql stable security definer set search_path=''
as $$
 select exists(select 1 from public.creator_admins a where a.user_id=(select auth.uid()) and a.active=true and a.role=any(p_roles));
$$;
create or replace function public.can_edit_creator_content()
returns boolean language sql stable security definer set search_path=''
as $$ select public.has_creator_role(array['owner','admin','editor']); $$;
create or replace function public.can_moderate_community()
returns boolean language sql stable security definer set search_path=''
as $$ select public.has_creator_role(array['owner','admin','moderator']); $$;
create or replace function public.can_view_creator_workspace()
returns boolean language sql stable security definer set search_path=''
as $$ select public.has_creator_role(array['owner','admin','editor','moderator','analyst']); $$;
create or replace function public.can_view_creator_analytics()
returns boolean language sql stable security definer set search_path=''
as $$ select public.has_creator_role(array['owner','admin','analyst']); $$;
revoke all on function public.has_creator_role(text[]) from public;
revoke all on function public.can_edit_creator_content() from public;
revoke all on function public.can_moderate_community() from public;
revoke all on function public.can_view_creator_workspace() from public;
revoke all on function public.can_view_creator_analytics() from public;
grant execute on function public.has_creator_role(text[]) to anon,authenticated;
grant execute on function public.can_edit_creator_content() to anon,authenticated;
grant execute on function public.can_moderate_community() to anon,authenticated;
grant execute on function public.can_view_creator_workspace() to anon,authenticated;
grant execute on function public.can_view_creator_analytics() to anon,authenticated;

-- Replace broad creator policies with least-privilege role gates.
drop policy if exists "Creators moderate posts" on public.community_posts;
create policy "Moderators manage community posts" on public.community_posts for all to authenticated
using(public.can_moderate_community()) with check(public.can_moderate_community());
drop policy if exists "Published posts visible" on public.community_posts;
create policy "Published posts visible" on public.community_posts for select to anon,authenticated
using(status='published' or author_id=(select auth.uid()) or public.can_moderate_community());

drop policy if exists "Creators moderate comments" on public.community_comments;
create policy "Moderators manage community comments" on public.community_comments for all to authenticated
using(public.can_moderate_community()) with check(public.can_moderate_community());
drop policy if exists "Published comments visible" on public.community_comments;
create policy "Published comments visible" on public.community_comments for select to anon,authenticated
using((status='published' and exists(select 1 from public.community_posts p where p.id=post_id and p.status='published')) or author_id=(select auth.uid()) or public.can_moderate_community());

drop policy if exists "Creators review reports" on public.content_reports;
create policy "Moderators review reports" on public.content_reports for select to authenticated using(public.can_moderate_community());
drop policy if exists "Creators update reports" on public.content_reports;
create policy "Moderators update reports" on public.content_reports for update to authenticated using(public.can_moderate_community()) with check(public.can_moderate_community());

drop policy if exists "Creators manage video metadata" on public.video_catalog;
create policy "Editors manage video metadata" on public.video_catalog for all to authenticated
using(public.can_edit_creator_content()) with check(public.can_edit_creator_content());
drop policy if exists "Published videos are visible" on public.video_catalog;
create policy "Published videos are visible" on public.video_catalog for select to anon,authenticated
using((published_at is not null and exists(select 1 from public.media_items m where m.id=media_id and m.is_published=true and m.media_type in ('video','youtube'))) or public.can_view_creator_workspace());

drop policy if exists "Creators manage playlists" on public.video_playlists;
create policy "Editors manage playlists" on public.video_playlists for all to authenticated
using(public.can_edit_creator_content()) with check(public.can_edit_creator_content());
drop policy if exists "Published playlists visible" on public.video_playlists;
create policy "Published playlists visible" on public.video_playlists for select to anon,authenticated
using(is_published or public.can_view_creator_workspace());

drop policy if exists "Creators manage playlist items" on public.video_playlist_items;
create policy "Editors manage playlist items" on public.video_playlist_items for all to authenticated
using(public.can_edit_creator_content()) with check(public.can_edit_creator_content());
drop policy if exists "Items in published playlists visible" on public.video_playlist_items;
create policy "Items in published playlists visible" on public.video_playlist_items for select to anon,authenticated
using(exists(select 1 from public.video_playlists p where p.id=playlist_id and p.is_published) or public.can_view_creator_workspace());

drop policy if exists "Creators moderate video comments" on public.video_comments;
create policy "Moderators manage video comments" on public.video_comments for all to authenticated
using(public.can_moderate_community()) with check(public.can_moderate_community());
drop policy if exists "Published video comments visible" on public.video_comments;
create policy "Published video comments visible" on public.video_comments for select to anon,authenticated
using((status='published' and exists(select 1 from public.video_catalog v join public.media_items m on m.id=v.media_id where v.media_id=video_comments.media_id and v.published_at is not null and m.is_published=true)) or author_id=(select auth.uid()) or public.can_moderate_community());

drop policy if exists "Creators inspect video views" on public.video_views;
create policy "Analysts inspect video views" on public.video_views for select to authenticated using(public.can_view_creator_analytics());

-- Reaction identities are never exposed to all Studio roles.
drop policy if exists "Members see own reactions" on public.community_reactions;
create policy "Members see own reactions" on public.community_reactions for select to authenticated using(user_id=(select auth.uid()));

-- Replace role checks in the existing RPCs without changing their validation or data logic.
do $$
declare r record; v_def text; v_roles text[];
begin
 v_roles:=array['create_creator_poll','delete_creator_media','delete_creator_social_link','publish_site_config','restore_site_config_version','save_creator_event','save_creator_social_link','save_site_config_draft','set_creator_event_status','set_creator_poll_status','reorder_creator_social_links'];
 for r in select p.oid from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname=any(v_roles) loop
  v_def:=pg_get_functiondef(r.oid);
  v_def:=replace(v_def,'public.is_active_creator()','public.can_edit_creator_content()');
  v_def:=replace(v_def,'is_active_creator()','can_edit_creator_content()');
  execute v_def;
 end loop;
 v_roles:=array['moderate_public_idea'];
 for r in select p.oid from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname=any(v_roles) loop
  v_def:=pg_get_functiondef(r.oid);
  v_def:=replace(v_def,'public.is_active_creator()','public.can_moderate_community()');
  v_def:=replace(v_def,'is_active_creator()','can_moderate_community()');
  execute v_def;
 end loop;
 v_roles:=array['get_creator_video_analytics'];
 for r in select p.oid from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname=any(v_roles) loop
  v_def:=pg_get_functiondef(r.oid);
  v_def:=replace(v_def,'public.is_active_creator()','public.can_view_creator_analytics()');
  v_def:=replace(v_def,'is_active_creator()','can_view_creator_analytics()');
  execute v_def;
 end loop;
 v_roles:=array['get_creator_events','get_creator_idea_queue','get_creator_poll_options','get_creator_poll_voters','get_creator_polls','get_creator_publish_history','get_creator_social_links','get_site_config_draft'];
 for r in select p.oid from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname=any(v_roles) loop
  v_def:=pg_get_functiondef(r.oid);
  v_def:=replace(v_def,'public.is_active_creator()','public.can_view_creator_workspace()');
  v_def:=replace(v_def,'is_active_creator()','can_view_creator_workspace()');
  execute v_def;
 end loop;
end $$;
