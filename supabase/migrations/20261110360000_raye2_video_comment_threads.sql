-- Raye2 video comment threads and per-comment reactions.
--
-- The watch page shipped flat, anonymous-looking comments: no replies, no reactions, no author
-- identity or counts. This adds one-level threading (a reply points at a top-level comment),
-- reactions on comments, and server-side thread/reply reads plus a reaction toggle. All writes go
-- through guarded RPCs or RLS policies so moderation and block rules stay in one place.
--
-- Threading is intentionally one level deep: replies always attach to a root comment, so the
-- public read returns the root plus its reply count and the client fetches replies on demand.

-- 1. Threading column.
alter table public.video_comments
  add column if not exists parent_comment_id uuid references public.video_comments(id) on delete cascade;

create index if not exists video_comments_parent_idx
  on public.video_comments(parent_comment_id, status, created_at);

-- Replies must not nest more than one level below a root comment.
create or replace function public.raye2_video_comment_parent_guard()
returns trigger language plpgsql security definer set search_path = ''
as $fn$
begin
  if new.parent_comment_id is not null then
    if new.parent_comment_id = new.id then
      raise exception 'a comment cannot reply to itself' using errcode = '22023';
    end if;
    if exists (
      select 1 from public.video_comments p
      where p.id = new.parent_comment_id and p.parent_comment_id is not null
    ) then
      raise exception 'replies are limited to one level' using errcode = '22023';
    end if;
    if exists (
      select 1 from public.video_comments p
      where p.id = new.parent_comment_id and p.media_id is distinct from new.media_id
    ) then
      raise exception 'reply must belong to the same video' using errcode = '22023';
    end if;
  end if;
  return new;
end;
$fn$;
revoke all on function public.raye2_video_comment_parent_guard() from public, anon, authenticated;
drop trigger if exists raye2_video_comment_parent_guard on public.video_comments;
create trigger raye2_video_comment_parent_guard
before insert or update on public.video_comments
for each row execute function public.raye2_video_comment_parent_guard();

-- 2. Replies on the public read surface must obey the same visibility as the parent comment:
--    the parent must be published and unblocked, and the reply itself published and unblocked.
drop policy if exists "Published video comments visible" on public.video_comments;
create policy "Published video comments visible" on public.video_comments for select to anon,authenticated
using(
  (
    status = 'published'
    and not public.is_member_blocked(author_id)
    and exists (
      select 1 from public.video_catalog v
      join public.media_items m on m.id = v.media_id
      where v.media_id = video_comments.media_id
        and v.published_at is not null
        and m.is_published = true
    )
    and (
      parent_comment_id is null
      or exists (
        select 1 from public.video_comments p
        where p.id = video_comments.parent_comment_id
          and p.status = 'published'
          and not public.is_member_blocked(p.author_id)
      )
    )
  )
  or author_id = (select auth.uid())
  or private.can_moderate_community()
);

-- 3. Reactions on comments.
create table if not exists public.video_comment_reactions (
  comment_id uuid not null references public.video_comments(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  reaction text not null check(reaction in ('spark','orbit','legend','laugh','mindblown','support')),
  created_at timestamptz not null default now(),
  primary key (comment_id, user_id)
);
create index if not exists video_comment_reactions_comment_idx
  on public.video_comment_reactions(comment_id);

alter table public.video_comment_reactions enable row level security;

revoke all on public.video_comment_reactions from anon, authenticated;
grant select on public.video_comment_reactions to anon, authenticated;
grant insert, delete on public.video_comment_reactions to authenticated;

-- Counts are read through a SECURITY DEFINER aggregate so anon never needs row-level access to the
-- reactions themselves (only the number is public).
create policy "Comment reaction counts visible" on public.video_comment_reactions for select to anon,authenticated
using(
  exists (
    select 1 from public.video_comments c
    where c.id = comment_id
      and c.status = 'published'
      and not public.is_member_blocked(c.author_id)
  )
);
create policy "Members react to visible comments" on public.video_comment_reactions for insert to authenticated
with check(
  user_id = (select auth.uid())
  and exists (
    select 1 from public.video_comments c
    where c.id = comment_id
      and c.status = 'published'
      and not public.is_member_blocked(c.author_id)
  )
);
create policy "Members remove own comment reactions" on public.video_comment_reactions for delete to authenticated
using(user_id = (select auth.uid()));

-- 4. Aggregated thread read: top-level comments plus reply counts and reaction counts.
create or replace function public.raye2_get_video_comment_thread(p_media_id uuid, p_limit integer default 50)
returns table (
  comment_id uuid,
  author_id uuid,
  author_handle text,
  author_display_name text,
  author_avatar_url text,
  body text,
  created_at timestamptz,
  reply_count integer,
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
    mp.avatar_url,
    c.body,
    c.created_at,
    (select count(*) from public.video_comments r
      where r.parent_comment_id = c.id and r.status = 'published')::int as reply_count,
    (select count(*) from public.video_comment_reactions x where x.comment_id = c.id)::int as reaction_count,
    (select x.reaction from public.video_comment_reactions x
      where x.comment_id = c.id and x.user_id = (select auth.uid())) as my_reaction
  from public.video_comments c
  left join public.member_profiles mp on mp.user_id = c.author_id
  where c.media_id = p_media_id
    and c.parent_comment_id is null
    and c.status = 'published'
    and not public.is_member_blocked(c.author_id)
    and exists (
      select 1 from public.video_catalog v
      join public.media_items m on m.id = v.media_id
      where v.media_id = c.media_id
        and v.published_at is not null
        and m.is_published = true
    )
  order by c.created_at desc
  limit greatest(1, least(coalesce(p_limit, 50), 100));
$fn$;
revoke all on function public.raye2_get_video_comment_thread(uuid,integer) from public;
grant execute on function public.raye2_get_video_comment_thread(uuid,integer) to anon, authenticated;

-- 5. Aggregated reply read for a single root comment.
create or replace function public.raye2_get_video_comment_replies(p_parent_id uuid, p_limit integer default 50)
returns table (
  comment_id uuid,
  author_id uuid,
  author_handle text,
  author_display_name text,
  author_avatar_url text,
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
    mp.avatar_url,
    c.body,
    c.created_at,
    (select count(*) from public.video_comment_reactions x where x.comment_id = c.id)::int as reaction_count,
    (select x.reaction from public.video_comment_reactions x
      where x.comment_id = c.id and x.user_id = (select auth.uid())) as my_reaction
  from public.video_comments c
  left join public.member_profiles mp on mp.user_id = c.author_id
  where c.parent_comment_id = p_parent_id
    and c.status = 'published'
    and not public.is_member_blocked(c.author_id)
    and exists (
      select 1 from public.video_comments p
      where p.id = c.parent_comment_id and p.status = 'published'
    )
  order by c.created_at asc
  limit greatest(1, least(coalesce(p_limit, 50), 100));
$fn$;
revoke all on function public.raye2_get_video_comment_replies(uuid,integer) from public;
grant execute on function public.raye2_get_video_comment_replies(uuid,integer) to anon, authenticated;

-- 6. Reaction toggle (insert / change / remove) guarded by comment visibility.
create or replace function public.raye2_toggle_comment_reaction(p_comment_id uuid, p_reaction text)
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
    select 1 from public.video_comments c
    where c.id = p_comment_id
      and c.status = 'published'
      and not public.is_member_blocked(c.author_id)
  ) then
    raise exception 'comment is not available' using errcode = '42501';
  end if;
  select reaction into v_existing
    from public.video_comment_reactions
    where comment_id = p_comment_id and user_id = v_user;
  if p_reaction is null or v_existing = p_reaction then
    delete from public.video_comment_reactions where comment_id = p_comment_id and user_id = v_user;
    return null;
  end if;
  insert into public.video_comment_reactions(comment_id, user_id, reaction)
  values(p_comment_id, v_user, p_reaction)
  on conflict (comment_id, user_id) do update set reaction = excluded.reaction;
  return p_reaction;
end;
$fn$;
revoke all on function public.raye2_toggle_comment_reaction(uuid,text) from public, anon;
grant execute on function public.raye2_toggle_comment_reaction(uuid,text) to authenticated;

-- 7. Notify the root comment author when someone replies (published replies only).
alter table public.member_notifications drop constraint if exists member_notifications_notification_type_check;
alter table public.member_notifications add constraint member_notifications_notification_type_check
  check(notification_type in ('follow','community_reaction','community_comment','video_reaction','video_comment','video_comment_reply','video_comment_reaction'));

create or replace function public.notify_video_comment_reply()
returns trigger language plpgsql security definer set search_path = ''
as $fn$
declare v_owner uuid;
begin
  if new.parent_comment_id is not null and new.status = 'published'
     and (tg_op = 'INSERT' or old.status is distinct from 'published') then
    select c.author_id into v_owner from public.video_comments c where c.id = new.parent_comment_id;
    if v_owner is not null and v_owner <> new.author_id then
      insert into public.member_notifications(recipient_id,actor_id,notification_type,target_type,target_id,message)
      values(v_owner,new.author_id,'video_comment_reply','video',new.media_id,'replied to your comment');
    end if;
  end if;
  return new;
end;
$fn$;
revoke all on function public.notify_video_comment_reply() from public, anon, authenticated;
grant execute on function public.notify_video_comment_reply() to postgres;
drop trigger if exists video_comment_reply_notification on public.video_comments;
create trigger video_comment_reply_notification
after insert or update of status on public.video_comments
for each row execute function public.notify_video_comment_reply();

-- 8. Notify a comment author when their comment is reacted to.
create or replace function public.notify_video_comment_reaction()
returns trigger language plpgsql security definer set search_path = ''
as $fn$
declare v_owner uuid; v_media uuid;
begin
  select c.author_id, c.media_id into v_owner, v_media from public.video_comments c where c.id = new.comment_id;
  if v_owner is not null and v_owner <> new.user_id then
    insert into public.member_notifications(recipient_id,actor_id,notification_type,target_type,target_id,message)
    values(v_owner,new.user_id,'video_comment_reaction','video',v_media,'reacted to your comment');
  end if;
  return new;
end;
$fn$;
revoke all on function public.notify_video_comment_reaction() from public, anon, authenticated;
grant execute on function public.notify_video_comment_reaction() to postgres;
drop trigger if exists video_comment_reaction_notification on public.video_comment_reactions;
create trigger video_comment_reaction_notification
after insert on public.video_comment_reactions
for each row execute function public.notify_video_comment_reaction();

notify pgrst, 'reload schema';
