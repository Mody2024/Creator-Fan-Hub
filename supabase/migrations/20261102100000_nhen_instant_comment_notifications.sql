-- Repair instant NHEN community-comment notifications.
-- Community comments are published on insert, so an UPDATE-only trigger misses them.
create or replace function public.notify_community_comment()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
declare
 v_author uuid;
begin
 if new.status='published'
    and (tg_op='INSERT' or old.status is distinct from 'published') then
  select author_id into v_author
  from public.community_posts
  where id=new.post_id and status='published';

  if v_author is not null and v_author<>new.author_id then
   insert into public.member_notifications(
    recipient_id,actor_id,notification_type,target_type,target_id,message
   )
   values(
    v_author,new.author_id,'community_comment','post',new.post_id,
    'commented on your community post'
   );
  end if;
 end if;
 return new;
end;
$$;

revoke all on function public.notify_community_comment() from public,anon,authenticated;
grant execute on function public.notify_community_comment() to postgres;

drop trigger if exists community_comment_notification on public.community_comments;
create trigger community_comment_notification
after insert or update of status on public.community_comments
for each row execute function public.notify_community_comment();
