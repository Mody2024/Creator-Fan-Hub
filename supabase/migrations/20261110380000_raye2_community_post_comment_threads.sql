-- Raye2 community post comment threads and per-comment reactions.
--
-- Post comments already had a moderation lifecycle and author attribution, but they were flat: no
-- replies, no reactions and no counts. This is the third (and final) comment surface to get the
-- same threading model as video comments and Shorts comments.
--
-- The public comment read is a SECURITY DEFINER RPC, so blocked-author filtering that the RLS
-- policy applies to direct selects must also be enforced inside the RPC.

-- 1. Threading column.
alter table public.community_comments
  add column if not exists parent_comment_id uuid references public.community_comments(id) on delete cascade;

create index if not exists community_comments_parent_idx
  on public.community_comments(parent_comment_id, status, created_at);

create or replace function public.raye2_community_comment_parent_guard()
returns trigger language plpgsql security definer set search_path = ''
as $fn$
begin
  if new.parent_comment_id is not null then
    if new.parent_comment_id = new.id then
      raise exception 'a comment cannot reply to itself' using errcode = '22023';
    end if;
    if exists (
      select 1 from public.community_comments p
      where p.id = new.parent_comment_id and p.parent_comment_id is not null
    ) then
      raise exception 'replies are limited to one level' using errcode = '22023';
    end if;
    if exists (
      select 1 from public.community_comments p
      where p.id = new.parent_comment_id and p.post_id is distinct from new.post_id
    ) then
      raise exception 'reply must belong to the same post' using errcode = '22023';
    end if;
  end if;
  return new;
end;
$fn$;
revoke all on function public.raye2_community_comment_parent_guard() from public, anon, authenticated;
drop trigger if exists raye2_community_comment_parent_guard on public.community_comments;
create trigger raye2_community_comment_parent_guard
before insert or update on public.community_comments
for each row execute function public.raye2_community_comment_parent_guard();

-- 2. Replies must respect the parent comment's visibility and block state.
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
    and (
      parent_comment_id is null
      or exists (
        select 1 from public.community_comments parent
        where parent.id = community_comments.parent_comment_id
          and parent.status = 'published'
          and not public.is_member_blocked(parent.author_id)
      )
    )
  )
  or author_id = (select auth.uid())
  or private.can_moderate_community()
);

-- 3. Reactions on post comments.
create table if not exists public.community_comment_reactions (
  comment_id uuid not null references public.community_comments(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  reaction text not null check(reaction in ('spark','orbit','legend','laugh','mindblown','support')),
  created_at timestamptz not null default now(),
  primary key (comment_id, user_id)
);
create index if not exists community_comment_reactions_comment_idx
  on public.community_comment_reactions(comment_id);

alter table public.community_comment_reactions enable row level security;
revoke all on public.community_comment_reactions from anon,authenticated;
grant select on public.community_comment_reactions to anon,authenticated;
grant insert, delete on public.community_comment_reactions to authenticated;

create policy "Comment reaction counts visible" on public.community_comment_reactions for select to anon,authenticated
using(
  exists (
    select 1 from public.community_comments c
    where c.id = comment_id
      and c.status = 'published'
      and not public.is_member_blocked(c.author_id)
  )
);
create policy "Members react to visible post comments" on public.community_comment_reactions for insert to authenticated
with check(
  user_id = (select auth.uid())
  and exists (
    select 1 from public.community_comments c
    where c.id = comment_id
      and c.status = 'published'
      and not public.is_member_blocked(c.author_id)
  )
);
create policy "Members remove own post comment reactions" on public.community_comment_reactions for delete to authenticated
using(user_id = (select auth.uid()));

-- 4. Thread read: top-level comments with reply and reaction counts (blocked authors excluded).
--    Return shape changes, so the old function must be dropped first.
drop function if exists public.raye2_get_post_comments(uuid,integer);
create or replace function public.raye2_get_post_comments(
  p_post_id uuid,
  p_limit integer default 50
)
returns table (
  id uuid,
  author_id uuid,
  body text,
  created_at timestamptz,
  author_handle text,
  author_display_name text,
  reply_count integer,
  reaction_count integer,
  my_reaction text
)
language sql
stable
security definer
set search_path = ''
as $fn$
  with bounded as (
    select least(greatest(coalesce(p_limit, 50), 1), 100) as lim
  ),
  allowed as (
    select p.id
    from public.community_posts p
    where p.id = p_post_id
      and p.status = 'published'
  )
  select cc.id,
         cc.author_id,
         cc.body,
         cc.created_at,
         mp.handle,
         mp.display_name,
         (select count(*) from public.community_comments r
           where r.parent_comment_id = cc.id and r.status = 'published')::int as reply_count,
         (select count(*) from public.community_comment_reactions x where x.comment_id = cc.id)::int as reaction_count,
         (select x.reaction from public.community_comment_reactions x
           where x.comment_id = cc.id and x.user_id = (select auth.uid())) as my_reaction
  from public.community_comments cc
  join allowed a on a.id = cc.post_id
  left join public.member_profiles mp on mp.user_id = cc.author_id
  cross join bounded b
  where cc.status = 'published'
    and cc.parent_comment_id is null
    and not public.is_member_blocked(cc.author_id)
  order by cc.created_at asc
  limit (select lim from bounded);
$fn$;
revoke all on function public.raye2_get_post_comments(uuid,integer) from public;
grant execute on function public.raye2_get_post_comments(uuid,integer) to anon, authenticated;

-- 5. Reply read for a single root comment.
create or replace function public.raye2_get_post_comment_replies(p_parent_id uuid, p_limit integer default 50)
returns table (
  comment_id uuid,
  author_id uuid,
  author_handle text,
  author_display_name text,
  body text,
  created_at timestamptz,
  reaction_count integer,
  my_reaction text
)
language sql
stable
security definer
set search_path = ''
as $fn$
  select
    c.id,
    c.author_id,
    mp.handle,
    mp.display_name,
    c.body,
    c.created_at,
    (select count(*) from public.community_comment_reactions x where x.comment_id = c.id)::int as reaction_count,
    (select x.reaction from public.community_comment_reactions x
      where x.comment_id = c.id and x.user_id = (select auth.uid())) as my_reaction
  from public.community_comments c
  left join public.member_profiles mp on mp.user_id = c.author_id
  where c.parent_comment_id = p_parent_id
    and c.status = 'published'
    and not public.is_member_blocked(c.author_id)
    and exists (
      select 1 from public.community_comments p
      where p.id = c.parent_comment_id and p.status = 'published'
    )
  order by c.created_at asc
  limit greatest(1, least(coalesce(p_limit, 50), 100));
$fn$;
revoke all on function public.raye2_get_post_comment_replies(uuid,integer) from public;
grant execute on function public.raye2_get_post_comment_replies(uuid,integer) to anon, authenticated;

-- 6. Reaction toggle (insert / change / remove) guarded by comment visibility.
create or replace function public.raye2_toggle_post_comment_reaction(p_comment_id uuid, p_reaction text)
returns text
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_user uuid := (select auth.uid());
  v_existing text;
begin
  if v_user is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;
  if p_reaction is not null and p_reaction not in ('spark','orbit','legend','laugh','mindblown','support') then
    raise exception 'unsupported reaction' using errcode = '22023';
  end if;
  if not exists (
    select 1 from public.community_comments c
    where c.id = p_comment_id
      and c.status = 'published'
      and not public.is_member_blocked(c.author_id)
  ) then
    raise exception 'comment is not available' using errcode = '42501';
  end if;
  select reaction into v_existing
    from public.community_comment_reactions
    where comment_id = p_comment_id and user_id = v_user;
  if p_reaction is null or v_existing = p_reaction then
    delete from public.community_comment_reactions where comment_id = p_comment_id and user_id = v_user;
    return null;
  end if;
  insert into public.community_comment_reactions(comment_id, user_id, reaction)
  values(p_comment_id, v_user, p_reaction)
  on conflict (comment_id, user_id) do update set reaction = excluded.reaction;
  return p_reaction;
end;
$fn$;
revoke all on function public.raye2_toggle_post_comment_reaction(uuid,text) from public, anon;
grant execute on function public.raye2_toggle_post_comment_reaction(uuid,text) to authenticated;

-- 7. Notify the parent comment author on a published reply.
alter table public.member_notifications drop constraint if exists member_notifications_notification_type_check;
alter table public.member_notifications add constraint member_notifications_notification_type_check
  check(notification_type in ('follow','community_reaction','community_comment','video_reaction','video_comment','video_comment_reply','video_comment_reaction','community_short_comment_reply','community_short_comment_reaction','community_comment_reply','community_comment_reaction'));

create or replace function public.notify_community_comment_reply()
returns trigger language plpgsql security definer set search_path = ''
as $fn$
declare v_owner uuid;
begin
  if new.parent_comment_id is not null and new.status = 'published'
     and (tg_op = 'INSERT' or old.status is distinct from 'published') then
    select c.author_id into v_owner from public.community_comments c where c.id = new.parent_comment_id;
    if v_owner is not null and v_owner <> new.author_id then
      insert into public.member_notifications(recipient_id,actor_id,notification_type,target_type,target_id,message)
      values(v_owner,new.author_id,'community_comment_reply','post',new.post_id,'replied to your comment');
    end if;
  end if;
  return new;
end;
$fn$;
revoke all on function public.notify_community_comment_reply() from public, anon, authenticated;
grant execute on function public.notify_community_comment_reply() to postgres;
drop trigger if exists community_comment_reply_notification on public.community_comments;
create trigger community_comment_reply_notification
after insert or update of status on public.community_comments
for each row execute function public.notify_community_comment_reply();

-- 8. Notify a comment author when their comment is reacted to.
create or replace function public.notify_community_comment_reaction()
returns trigger language plpgsql security definer set search_path = ''
as $fn$
declare v_owner uuid; v_post uuid;
begin
  select c.author_id, c.post_id into v_owner, v_post from public.community_comments c where c.id = new.comment_id;
  if v_owner is not null and v_owner <> new.user_id then
    insert into public.member_notifications(recipient_id,actor_id,notification_type,target_type,target_id,message)
    values(v_owner,new.user_id,'community_comment_reaction','post',v_post,'reacted to your comment');
  end if;
  return new;
end;
$fn$;
revoke all on function public.notify_community_comment_reaction() from public, anon, authenticated;
grant execute on function public.notify_community_comment_reaction() to postgres;
drop trigger if exists community_comment_reaction_notification on public.community_comment_reactions;
create trigger community_comment_reaction_notification
after insert on public.community_comment_reactions
for each row execute function public.notify_community_comment_reaction();

notify pgrst, 'reload schema';
