-- Raye2 Wave 5 community topic channels.
--
-- The plan requires the community feed to support topic channels alongside posts, announcements,
-- polls and collections (plan line 651). The feed had no notion of topics. This adds a curated set
-- of channels, lets a post carry one channel, exposes a channel filter on the feed read and a
-- public topic listing with counts.

-- 1. Curated topic channels.
create table if not exists public.community_topics (
  slug text primary key check (slug ~ '^[a-z0-9_-]{2,40}$'),
  name text not null check (char_length(btrim(name)) between 2 and 60),
  description text not null default '' check (char_length(description) <= 240),
  position integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);
alter table public.community_topics enable row level security;
revoke all on public.community_topics from anon, authenticated;
grant select on public.community_topics to anon, authenticated;

drop policy if exists "Anyone reads active community topics" on public.community_topics;
create policy "Anyone reads active community topics"
on public.community_topics for select to anon, authenticated
using (is_active);

insert into public.community_topics(slug,name,description,position) values
  ('general','General','Open conversation for the whole community.',0),
  ('feedback','Feedback','Ideas and feedback about the work.',1),
  ('help','Help','Ask questions and help other members.',2),
  ('behind-the-scenes','Behind the scenes','Process, drafts and production notes.',3),
  ('clips','Clips','Short clips and highlights.',4)
on conflict (slug) do nothing;

-- 2. A post can carry one topic channel.
alter table public.community_posts add column if not exists topic_slug text;
alter table public.community_posts drop constraint if exists community_posts_topic_fk;
alter table public.community_posts add constraint community_posts_topic_fk
  foreign key (topic_slug) references public.community_topics(slug) on delete set null;
create index if not exists community_posts_topic_idx on public.community_posts(topic_slug) where topic_slug is not null;

-- 3. Authors set their post's topic through a guarded RPC (the direct insert policy is untouched,
--    so member posts still publish instantly; the topic is assigned afterwards).
create or replace function public.raye2_set_post_topic(p_post_id uuid, p_topic_slug text)
returns void language plpgsql security definer set search_path = ''
as $fn$
begin
  if auth.uid() is null then raise exception 'sign in required' using errcode = '42501'; end if;
  if p_topic_slug is not null and not exists (
    select 1 from public.community_topics where slug = p_topic_slug and is_active
  ) then
    raise exception 'unknown topic' using errcode = '22023';
  end if;
  if not exists (
    select 1 from public.community_posts where id = p_post_id and author_id = auth.uid()
  ) then
    raise exception 'only the author can set the topic' using errcode = '42501';
  end if;
  update public.community_posts set topic_slug = p_topic_slug, updated_at = now() where id = p_post_id;
end;
$fn$;
revoke all on function public.raye2_set_post_topic(uuid,text) from public, anon;
grant execute on function public.raye2_set_post_topic(uuid,text) to authenticated;

-- 4. Public topic listing with published-post counts.
create or replace function public.raye2_list_community_topics()
returns table (slug text, name text, description text, post_count bigint)
language sql stable security definer set search_path = ''
as $fn$
  select t.slug, t.name, t.description,
    (select count(*) from public.community_posts p
      where p.topic_slug = t.slug and p.status = 'published')::bigint as post_count
  from public.community_topics t
  where t.is_active
  order by t.position asc, t.name asc;
$fn$;
revoke all on function public.raye2_list_community_topics() from public;
grant execute on function public.raye2_list_community_topics() to anon, authenticated;

-- 5. Feed read gains a topic filter and exposes the post's topic.
drop function if exists public.raye2_get_community_feed(integer,text,boolean);
create or replace function public.raye2_get_community_feed(
  p_limit integer default 40,
  p_sort text default 'latest',
  p_following_only boolean default false,
  p_topic text default null
)
returns table (
  id uuid,
  author_id uuid,
  post_type text,
  body text,
  linked_video_id uuid,
  created_at timestamptz,
  pinned boolean,
  topic_slug text,
  topic_name text,
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
    select f.followed_id from public.member_follows f, viewer v where f.follower_id = v.me
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
           p.topic_slug,
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
      and (p_topic is null or p.topic_slug = p_topic)
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
         s.topic_slug,
         ct.name,
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
  left join public.community_topics ct on ct.slug = s.topic_slug
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
revoke all on function public.raye2_get_community_feed(integer,text,boolean,text) from public;
grant execute on function public.raye2_get_community_feed(integer,text,boolean,text) to anon, authenticated;

notify pgrst, 'reload schema';
