-- NHEN Identity notifications for meaningful member interactions.
create table if not exists public.member_notifications(
 id uuid primary key default gen_random_uuid(),
 recipient_id uuid not null references auth.users(id) on delete cascade,
 actor_id uuid references auth.users(id) on delete set null,
 notification_type text not null check(notification_type in ('follow','community_reaction','community_comment','video_reaction','video_comment')),
 target_type text not null check(target_type in ('profile','post','video')),
 target_id uuid not null,
 message text not null check(char_length(message) between 1 and 240),
 read_at timestamptz,
 created_at timestamptz not null default now()
);
create index if not exists member_notifications_inbox_idx on public.member_notifications(recipient_id,created_at desc);
alter table public.member_notifications enable row level security;
revoke all on public.member_notifications from anon,authenticated;
grant select,update on public.member_notifications to authenticated;
create policy "Members read own notifications" on public.member_notifications for select to authenticated using(recipient_id=(select auth.uid()));
create policy "Members mark own notifications read" on public.member_notifications for update to authenticated using(recipient_id=(select auth.uid())) with check(recipient_id=(select auth.uid()));

create or replace function public.notify_member_follow()
returns trigger language plpgsql security definer set search_path=''
as $$
begin
 if new.follower_id<>new.followed_id then
  insert into public.member_notifications(recipient_id,actor_id,notification_type,target_type,target_id,message)
  values(new.followed_id,new.follower_id,'follow','profile',new.follower_id,'started following you');
 end if;
 return new;
end;
$$;
revoke all on function public.notify_member_follow() from public, anon, authenticated;
grant execute on function public.notify_member_follow() to postgres;
drop trigger if exists member_follow_notification on public.member_follows;
create trigger member_follow_notification after insert on public.member_follows for each row execute function public.notify_member_follow();

create or replace function public.notify_community_reaction()
returns trigger language plpgsql security definer set search_path=''
as $$
declare v_author uuid;
begin
 select author_id into v_author from public.community_posts where id=new.post_id and status='published';
 if v_author is not null and v_author<>new.user_id then
  insert into public.member_notifications(recipient_id,actor_id,notification_type,target_type,target_id,message)
  values(v_author,new.user_id,'community_reaction','post',new.post_id,'reacted to your community post');
 end if;
 return new;
end;
$$;
revoke all on function public.notify_community_reaction() from public, anon, authenticated;
grant execute on function public.notify_community_reaction() to postgres;
drop trigger if exists community_reaction_notification on public.community_reactions;
create trigger community_reaction_notification after insert on public.community_reactions for each row execute function public.notify_community_reaction();

create or replace function public.notify_community_comment()
returns trigger language plpgsql security definer set search_path=''
as $$
declare v_author uuid;
begin
 if new.status='published' and old.status is distinct from 'published' then
  select author_id into v_author from public.community_posts where id=new.post_id and status='published';
  if v_author is not null and v_author<>new.author_id then
   insert into public.member_notifications(recipient_id,actor_id,notification_type,target_type,target_id,message)
   values(v_author,new.author_id,'community_comment','post',new.post_id,'commented on your community post');
  end if;
 end if;
 return new;
end;
$$;
revoke all on function public.notify_community_comment() from public, anon, authenticated;
grant execute on function public.notify_community_comment() to postgres;
drop trigger if exists community_comment_notification on public.community_comments;
create trigger community_comment_notification after update of status on public.community_comments for each row execute function public.notify_community_comment();

create or replace function public.notify_video_reaction()
returns trigger language plpgsql security definer set search_path=''
as $$
declare v_owner uuid;
begin
 select m.owner_id into v_owner from public.media_items m join public.video_catalog v on v.media_id=m.id where m.id=new.media_id and v.published_at is not null;
 if v_owner is not null and v_owner<>new.user_id then
  insert into public.member_notifications(recipient_id,actor_id,notification_type,target_type,target_id,message)
  values(v_owner,new.user_id,'video_reaction','video',new.media_id,'reacted to your video');
 end if;
 return new;
end;
$$;
revoke all on function public.notify_video_reaction() from public, anon, authenticated;
grant execute on function public.notify_video_reaction() to postgres;
drop trigger if exists video_reaction_notification on public.video_reactions;
create trigger video_reaction_notification after insert on public.video_reactions for each row execute function public.notify_video_reaction();

create or replace function public.notify_video_comment()
returns trigger language plpgsql security definer set search_path=''
as $$
declare v_owner uuid;
begin
 if new.status='published' and old.status is distinct from 'published' then
  select m.owner_id into v_owner from public.media_items m where m.id=new.media_id;
  if v_owner is not null and v_owner<>new.author_id then
   insert into public.member_notifications(recipient_id,actor_id,notification_type,target_type,target_id,message)
   values(v_owner,new.author_id,'video_comment','video',new.media_id,'commented on your video');
  end if;
 end if;
 return new;
end;
$$;
revoke all on function public.notify_video_comment() from public, anon, authenticated;
grant execute on function public.notify_video_comment() to postgres;
drop trigger if exists video_comment_notification on public.video_comments;
create trigger video_comment_notification after update of status on public.video_comments for each row execute function public.notify_video_comment();
