-- NHEN Identity achievements: transparent participation milestones, no streak pressure.
create table if not exists public.achievement_catalog(
 code text primary key,
 title text not null,
 description text not null,
 icon text not null,
 position integer not null default 0
);
insert into public.achievement_catalog(code,title,description,icon,position) values
 ('first_post','First Voice','Published your first community post','✦',1),
 ('first_follow','First Connection','Started following your first member','◎',2),
 ('five_posts','Conversation Starter','Published five community posts','◈',3),
 ('five_follows','Community Explorer','Followed five members','⌘',4),
 ('first_video_comment','Watch Contributor','Had your first video comment approved','▶',5)
on conflict(code) do update set title=excluded.title,description=excluded.description,icon=excluded.icon,position=excluded.position;

create table if not exists public.member_achievements(
 user_id uuid not null references auth.users(id) on delete cascade,
 achievement_code text not null references public.achievement_catalog(code) on delete cascade,
 earned_at timestamptz not null default now(),
 primary key(user_id,achievement_code)
);
alter table public.achievement_catalog enable row level security;
alter table public.member_achievements enable row level security;
revoke all on public.achievement_catalog,public.member_achievements from anon,authenticated;
grant select on public.achievement_catalog,public.member_achievements to anon,authenticated;
create policy "Achievement catalog is public" on public.achievement_catalog for select to anon,authenticated using(true);
create policy "Earned achievements are public" on public.member_achievements for select to anon,authenticated using(true);

create or replace function public.award_member_achievement(p_user_id uuid,p_code text)
returns void language plpgsql security definer set search_path=''
as $$
begin
 insert into public.member_achievements(user_id,achievement_code)
 select p_user_id,a.code from public.achievement_catalog a where a.code=p_code
 on conflict(user_id,achievement_code) do nothing;
end;
$$;
revoke all on function public.award_member_achievement(uuid,text) from public,anon,authenticated;
grant execute on function public.award_member_achievement(uuid,text) to postgres;

create or replace function public.award_post_achievements()
returns trigger language plpgsql security definer set search_path=''
as $$
declare v_count integer;
begin
 if new.status='published' and old.status is distinct from 'published' then
  perform public.award_member_achievement(new.author_id,'first_post');
  select count(*) into v_count from public.community_posts where author_id=new.author_id and status='published';
  if v_count>=5 then perform public.award_member_achievement(new.author_id,'five_posts'); end if;
 end if;
 return new;
end;
$$;

revoke all on function public.award_post_achievements() from public,anon,authenticated;
grant execute on function public.award_post_achievements() to postgres;drop trigger if exists community_post_achievement on public.community_posts;
create trigger community_post_achievement after update of status on public.community_posts for each row execute function public.award_post_achievements();

create or replace function public.award_follow_achievements()
returns trigger language plpgsql security definer set search_path=''
as $$
declare v_count integer;
begin
 perform public.award_member_achievement(new.follower_id,'first_follow');
 select count(*) into v_count from public.member_follows where follower_id=new.follower_id;
 if v_count>=5 then perform public.award_member_achievement(new.follower_id,'five_follows'); end if;
 return new;
end;
$$;

revoke all on function public.award_follow_achievements() from public,anon,authenticated;
grant execute on function public.award_follow_achievements() to postgres;drop trigger if exists member_follow_achievement on public.member_follows;
create trigger member_follow_achievement after insert on public.member_follows for each row execute function public.award_follow_achievements();

create or replace function public.award_video_comment_achievement()
returns trigger language plpgsql security definer set search_path=''
as $$
begin
 if new.status='published' and old.status is distinct from 'published' then
  perform public.award_member_achievement(new.author_id,'first_video_comment');
 end if;
 return new;
end;
$$;

revoke all on function public.award_video_comment_achievement() from public,anon,authenticated;
grant execute on function public.award_video_comment_achievement() to postgres;drop trigger if exists video_comment_achievement on public.video_comments;
create trigger video_comment_achievement after update of status on public.video_comments for each row execute function public.award_video_comment_achievement();
