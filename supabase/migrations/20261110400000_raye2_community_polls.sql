-- Raye2 Wave 5 community polls.
--
-- The plan calls for feed polls with a question, options, voting rules, a closing time and
-- results visibility (plan lines 578 and 651). None of that existed: community posts could only
-- carry text and an optional video moment. This adds a self-contained poll on community posts,
-- separate from the creator-owned polls table.
--
-- Design:
--   * A poll belongs to exactly one community post (1:1), which reuses the existing post
--     visibility, moderation, comment and reaction machinery.
--   * Votes are cast through a guarded SECURITY DEFINER RPC (never a direct table write) so
--     membership, poll-open state and the one-vote-per-member rule are enforced server-side.
--   * Tally counts are exposed through a SECURITY DEFINER read RPC so anonymous visitors can see
--     results without being able to read individual votes.
--   * Notifications reuse the member_notifications inbox with a new 'community_poll_vote' type.

-- 1. Poll + options + votes.
create table if not exists public.community_post_polls (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null unique references public.community_posts(id) on delete cascade,
  question text not null check (char_length(btrim(question)) between 1 and 200),
  closes_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.community_post_poll_options (
  poll_id uuid not null references public.community_post_polls(id) on delete cascade,
  option_key text not null check (char_length(btrim(option_key)) between 1 and 80),
  position integer not null default 0,
  primary key (poll_id, option_key)
);

create table if not exists public.community_post_poll_votes (
  poll_id uuid not null references public.community_post_polls(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  option_key text not null,
  created_at timestamptz not null default now(),
  primary key (poll_id, user_id),
  foreign key (poll_id, option_key) references public.community_post_poll_options(poll_id, option_key) on delete cascade
);
create index if not exists community_post_poll_votes_poll_idx on public.community_post_poll_votes(poll_id);

-- No direct client access to any of the three tables; everything goes through guarded RPCs.
alter table public.community_post_polls enable row level security;
alter table public.community_post_poll_options enable row level security;
alter table public.community_post_poll_votes enable row level security;
revoke all on public.community_post_polls from anon, authenticated;
revoke all on public.community_post_poll_options from anon, authenticated;
revoke all on public.community_post_poll_votes from anon, authenticated;

-- 2. Create a poll post (the post row plus its poll and options) in one transaction.
create or replace function public.raye2_create_community_poll(
  p_question text,
  p_options jsonb,
  p_closes_at timestamptz default null
)
returns table (post_id uuid, result_code text)
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_user uuid := (select auth.uid());
  v_post uuid;
  v_poll uuid;
  v_option text;
  v_position integer := 0;
  v_seen text[] := array[]::text[];
begin
  if v_user is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;
  if p_question is null or char_length(btrim(p_question)) not between 1 and 200 then
    raise exception 'a poll question is required' using errcode = '22023';
  end if;
  if p_closes_at is not null and p_closes_at <= now() then
    raise exception 'the closing time must be in the future' using errcode = '22023';
  end if;
  if p_options is null or jsonb_typeof(p_options) <> 'array' or jsonb_array_length(p_options) not between 2 and 6 then
    raise exception 'between 2 and 6 options are required' using errcode = '22023';
  end if;

  insert into public.community_posts(author_id, post_type, body, status)
  values (v_user, 'member', btrim(p_question), 'published')
  returning id into v_post;

  insert into public.community_post_polls(post_id, question, closes_at)
  values (v_post, btrim(p_question), p_closes_at)
  returning id into v_poll;

  for v_option in select jsonb_array_elements_text(p_options) loop
    v_option := btrim(v_option);
    if char_length(v_option) not between 1 and 80 then
      raise exception 'each option must be 1 to 80 characters' using errcode = '22023';
    end if;
    if lower(v_option) = any (v_seen) then
      raise exception 'options must be unique' using errcode = '22023';
    end if;
    v_seen := v_seen || lower(v_option);
    insert into public.community_post_poll_options(poll_id, option_key, position)
    values (v_poll, v_option, v_position);
    v_position := v_position + 1;
  end loop;

  return query select v_post, 'created'::text;
end;
$fn$;
revoke all on function public.raye2_create_community_poll(text,jsonb,timestamptz) from public, anon;
grant execute on function public.raye2_create_community_poll(text,jsonb,timestamptz) to authenticated;

-- 3. Vote on a poll. Membership, open state and one-vote-per-member are enforced here.
create or replace function public.raye2_vote_community_poll(
  p_poll_id uuid,
  p_option_key text
)
returns table (voted boolean, result_code text, total bigint)
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_user uuid := (select auth.uid());
  v_post uuid;
  v_closes timestamptz;
  v_total bigint;
begin
  if v_user is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;
  if p_option_key is null or char_length(btrim(p_option_key)) = 0 then
    raise exception 'an option is required' using errcode = '22023';
  end if;

  select pl.post_id, pl.closes_at into v_post, v_closes
  from public.community_post_polls pl
  where pl.id = p_poll_id;
  if v_post is null then
    raise exception 'poll not found' using errcode = '22023';
  end if;
  if not exists (
    select 1 from public.community_posts p
    where p.id = v_post and p.status = 'published' and not public.is_member_blocked(p.author_id)
  ) then
    raise exception 'poll is not available' using errcode = '42501';
  end if;
  if v_closes is not null and v_closes <= now() then
    raise exception 'this poll has closed' using errcode = '22023';
  end if;
  if not exists (
    select 1 from public.community_post_poll_options o
    where o.poll_id = p_poll_id and o.option_key = btrim(p_option_key)
  ) then
    raise exception 'unknown option' using errcode = '22023';
  end if;

  if exists (select 1 from public.community_post_poll_votes v where v.poll_id = p_poll_id and v.user_id = v_user) then
    return query select false, 'already_voted'::text,
      (select count(*) from public.community_post_poll_votes v where v.poll_id = p_poll_id);
    return;
  end if;

  insert into public.community_post_poll_votes(poll_id, user_id, option_key)
  values (p_poll_id, v_user, btrim(p_option_key));

  select count(*) into v_total from public.community_post_poll_votes v where v.poll_id = p_poll_id;
  return query select true, 'voted'::text, v_total;
end;
$fn$;
revoke all on function public.raye2_vote_community_poll(uuid,text) from public, anon;
grant execute on function public.raye2_vote_community_poll(uuid,text) to authenticated;

-- 4. Public tally read: option counts and the viewer's own vote, no individual votes exposed.
create or replace function public.raye2_get_community_poll(p_poll_id uuid)
returns table (
  poll_id uuid,
  question text,
  closes_at timestamptz,
  is_closed boolean,
  total bigint,
  my_vote text,
  options jsonb
)
language sql
stable
security definer
set search_path = ''
as $fn$
  select pl.id,
         pl.question,
         pl.closes_at,
         (pl.closes_at is not null and pl.closes_at <= now()) as is_closed,
         (select count(*) from public.community_post_poll_votes v where v.poll_id = pl.id)::bigint as total,
         (select v.option_key from public.community_post_poll_votes v
           where v.poll_id = pl.id and v.user_id = (select auth.uid())) as my_vote,
         coalesce((
           select jsonb_agg(jsonb_build_object('option', o.option_key, 'votes', coalesce(vc.cnt, 0)) order by o.position)
           from public.community_post_poll_options o
           left join lateral (
             select count(*) as cnt from public.community_post_poll_votes v
             where v.poll_id = o.poll_id and v.option_key = o.option_key
           ) vc on true
           where o.poll_id = pl.id
         ), '[]'::jsonb) as options
  from public.community_post_polls pl
  join public.community_posts p on p.id = pl.post_id
  where pl.id = p_poll_id
    and p.status = 'published'
    and not public.is_member_blocked(p.author_id);
$fn$;
revoke all on function public.raye2_get_community_poll(uuid) from public;
grant execute on function public.raye2_get_community_poll(uuid) to anon, authenticated;

-- 5. Extend the feed read with poll data (return shape changes, so drop first).
drop function if exists public.raye2_get_community_feed(integer,text,boolean);
create or replace function public.raye2_get_community_feed(
  p_limit integer default 40,
  p_sort text default 'latest',
  p_following_only boolean default false
)
returns table (
  id uuid,
  author_id uuid,
  post_type text,
  body text,
  linked_video_id uuid,
  created_at timestamptz,
  pinned boolean,
  author_handle text,
  author_display_name text,
  author_avatar_url text,
  reaction_count bigint,
  comment_count bigint,
  poll_id uuid,
  poll_question text,
  poll_options jsonb,
  poll_total bigint,
  poll_closes_at timestamptz,
  my_poll_vote text
)
language sql
stable
security definer
set search_path = ''
as $fn$
  with viewer as (
    select (select auth.uid()) as me
  ),
  bounded as (
    select least(greatest(coalesce(p_limit, 40), 1), 80) as lim,
           case when p_sort = 'hot' then 'hot' else 'latest' end as sort_key
  ),
  followed as (
    select f.followed_id
    from public.member_follows f, viewer v
    where f.follower_id = v.me
  ),
  blocked as (
    select b.blocked_id as uid from public.member_blocks b, viewer v where b.blocker_id = v.me
    union
    select b.blocker_id as uid from public.member_blocks b, viewer v where b.blocked_id = v.me
  ),
  scored as (
    select p.id,
           p.author_id,
           p.post_type,
           p.body,
           p.linked_video_id,
           p.created_at,
           p.pinned,
           coalesce(r.reaction_count, 0) as reaction_count,
           coalesce(c.comment_count, 0) as comment_count,
           (3 * coalesce(r.reaction_count, 0) + 2 * coalesce(c.comment_count, 0) + 1)
             / power(extract(epoch from (now() - p.created_at)) / 3600.0 + 2, 1.5) as hot_score
    from public.community_posts p
    cross join viewer v
    left join lateral (
      select count(*) as reaction_count from public.community_reactions cr where cr.post_id = p.id
    ) r on true
    left join lateral (
      select count(*) as comment_count from public.community_comments cc
      where cc.post_id = p.id and cc.status = 'published'
    ) c on true
    where p.status = 'published'
      and (not p_following_only or p.author_id in (select followed_id from followed))
      and not exists (select 1 from blocked b where b.uid = p.author_id)
  )
  select s.id,
         s.author_id,
         s.post_type,
         s.body,
         s.linked_video_id,
         s.created_at,
         s.pinned,
         mp.handle,
         mp.display_name,
         mp.avatar_url,
         s.reaction_count,
         s.comment_count,
         pl.id,
         pl.question,
         opt.options,
         (select count(*) from public.community_post_poll_votes v where v.poll_id = pl.id)::bigint,
         pl.closes_at,
         (select v.option_key from public.community_post_poll_votes v
           where v.poll_id = pl.id and v.user_id = (select auth.uid()))
  from scored s
  left join public.member_profiles mp on mp.user_id = s.author_id
  left join public.community_post_polls pl on pl.post_id = s.id
  left join lateral (
    select coalesce(jsonb_agg(jsonb_build_object('option', o.option_key, 'votes', coalesce(vc.cnt, 0)) order by o.position), '[]'::jsonb) as options
    from public.community_post_poll_options o
    left join lateral (
      select count(*) as cnt from public.community_post_poll_votes v
      where v.poll_id = o.poll_id and v.option_key = o.option_key
    ) vc on true
    where o.poll_id = pl.id
  ) opt on true
  cross join bounded b
  order by s.pinned desc,
           case when b.sort_key = 'hot' then s.hot_score end desc nulls last,
           s.created_at desc
  limit (select lim from bounded);
$fn$;
revoke all on function public.raye2_get_community_feed(integer,text,boolean) from public;
grant execute on function public.raye2_get_community_feed(integer,text,boolean) to anon, authenticated;

-- 6. Notify the poll author when someone votes.
alter table public.member_notifications drop constraint if exists member_notifications_notification_type_check;
alter table public.member_notifications add constraint member_notifications_notification_type_check
  check(notification_type in ('follow','community_reaction','community_comment','video_reaction','video_comment','video_comment_reply','video_comment_reaction','community_short_comment_reply','community_short_comment_reaction','community_comment_reply','community_comment_reaction','community_poll_vote'));

create or replace function public.notify_community_poll_vote()
returns trigger language plpgsql security definer set search_path = ''
as $fn$
declare v_owner uuid; v_post uuid;
begin
  select p.author_id, p.id into v_owner, v_post
  from public.community_post_polls pl
  join public.community_posts p on p.id = pl.post_id
  where pl.id = new.poll_id;
  if v_owner is not null and v_owner <> new.user_id then
    insert into public.member_notifications(recipient_id,actor_id,notification_type,target_type,target_id,message)
    values(v_owner,new.user_id,'community_poll_vote','post',v_post,'voted in your poll');
  end if;
  return new;
end;
$fn$;
revoke all on function public.notify_community_poll_vote() from public, anon, authenticated;
grant execute on function public.notify_community_poll_vote() to postgres;
drop trigger if exists community_poll_vote_notification on public.community_post_poll_votes;
create trigger community_poll_vote_notification
after insert on public.community_post_poll_votes
for each row execute function public.notify_community_poll_vote();

notify pgrst, 'reload schema';
