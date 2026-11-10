-- Raye2 Wave 5: community publishing breadth (drafts + scheduled publishing) and
-- member-curated saved-library collections.
--
-- Drafts/scheduling: the community composer only supported instant publishing through a
-- direct table insert, and the post status enum had no 'scheduled' state, so a member
-- could not stage a post or have it appear later without being online. This adds a
-- 'scheduled' status plus guarded RPCs that stage, publish and cancel the caller's own
-- posts. Scheduled posts become visible the moment their publish time passes (evaluated
-- lazily against now(), which avoids depending on pg_cron).
--
-- Collections: bookmarks were a flat list. This adds member-owned collections so saved
-- posts and videos can be grouped, with items constrained to the caller's own bookmarks.

-- 1. Allow posts to be staged for later publishing.
alter table public.community_posts drop constraint if exists community_posts_status_check;
alter table public.community_posts
  add constraint community_posts_status_check
  check (status in ('pending','scheduled','published','rejected','removed'));
alter table public.community_posts
  add column if not exists publish_at timestamptz;
alter table public.community_posts
  add column if not exists published_at timestamptz;

-- A post may only carry a publish time while it is scheduled.
alter table public.community_posts drop constraint if exists community_posts_publish_at_check;
alter table public.community_posts
  add constraint community_posts_publish_at_check
  check (publish_at is null or status = 'scheduled');

create index if not exists community_posts_publish_idx
  on public.community_posts(publish_at) where status = 'scheduled';

-- Members may stage a draft (scheduled, no publish time yet) as well as publish instantly.
-- A publish time can only be set later through the guarded scheduling RPC.
drop policy if exists "Members publish community posts instantly" on public.community_posts;
create policy "Members publish community posts instantly" on public.community_posts
for insert to authenticated
with check (
 author_id=(select auth.uid()) and post_type='member' and pinned=false
 and (status='published' or (status='scheduled' and publish_at is null))
 and (
   linked_video_id is null
   or exists(
     select 1 from public.video_catalog v join public.media_items m on m.id=v.media_id
     where v.media_id=linked_video_id and v.published_at is not null and m.is_published=true
       and (moment_end_seconds is null or v.duration_seconds is null or moment_end_seconds<=v.duration_seconds)
   )
 )
);

-- Promote any scheduled post whose time has arrived. SECURITY DEFINER so it can be
-- invoked by any reader before a feed query; it only ever advances due posts.
create or replace function public.raye2_publish_due_community_posts()
returns integer
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_published integer := 0;
begin
  with due as (
    update public.community_posts
    set status = 'published', published_at = now(), publish_at = null
    where status = 'scheduled' and publish_at is not null and publish_at <= now()
    returning 1
  )
  select count(*) into v_published from due;
  return v_published;
end;
$fn$;
revoke all on function public.raye2_publish_due_community_posts() from public;
grant execute on function public.raye2_publish_due_community_posts() to anon, authenticated;

-- 2. Staging, publishing and cancelling the caller's own posts.
create or replace function public.raye2_save_community_draft(p_post_id uuid, p_body text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_me uuid := (select auth.uid());
  v_id uuid;
begin
  if v_me is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;
  if p_body is null or char_length(btrim(p_body)) < 1 or char_length(btrim(p_body)) > 2000 then
    raise exception 'post body must be between 1 and 2000 characters' using errcode = '22023';
  end if;
  if p_post_id is null then
    insert into public.community_posts(author_id, post_type, body, status, pinned)
    values (v_me, 'member', btrim(p_body), 'scheduled', false)
    returning id into v_id;
    return v_id;
  end if;
  update public.community_posts
  set body = btrim(p_body)
  where id = p_post_id
    and author_id = v_me
    and status = 'scheduled'
    and publish_at is null
  returning id into v_id;
  if v_id is null then
    raise exception 'only an unpublished draft you own can be edited' using errcode = '42501';
  end if;
  return v_id;
end;
$fn$;
revoke all on function public.raye2_save_community_draft(uuid,text) from public, anon;
grant execute on function public.raye2_save_community_draft(uuid,text) to authenticated;

create or replace function public.raye2_schedule_community_post(p_post_id uuid, p_publish_at timestamptz)
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_me uuid := (select auth.uid());
  v_at timestamptz;
begin
  if v_me is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;
  if p_post_id is null or p_publish_at is null then
    raise exception 'post id and publish time are required' using errcode = '22023';
  end if;
  if p_publish_at <= now() then
    raise exception 'scheduled time must be in the future' using errcode = '22023';
  end if;
  update public.community_posts
  set status = 'scheduled', publish_at = p_publish_at
  where id = p_post_id
    and author_id = v_me
    and status = 'scheduled'
    and publish_at is null
  returning publish_at into v_at;
  if v_at is null then
    raise exception 'only an unpublished draft you own can be scheduled' using errcode = '42501';
  end if;
  return v_at;
end;
$fn$;
revoke all on function public.raye2_schedule_community_post(uuid,timestamptz) from public, anon;
grant execute on function public.raye2_schedule_community_post(uuid,timestamptz) to authenticated;

create or replace function public.raye2_publish_community_post(p_post_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_me uuid := (select auth.uid());
begin
  if v_me is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;
  if p_post_id is null then
    raise exception 'post id is required' using errcode = '22023';
  end if;
  update public.community_posts
  set status = 'published', published_at = now(), publish_at = null
  where id = p_post_id
    and author_id = v_me
    and status = 'scheduled';
  if not found then
    raise exception 'only a scheduled post you own can be published' using errcode = '42501';
  end if;
end;
$fn$;
revoke all on function public.raye2_publish_community_post(uuid) from public, anon;
grant execute on function public.raye2_publish_community_post(uuid) to authenticated;

-- 3. Member-owned collections over saved posts and videos.
create table if not exists public.raye2_collections (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 60),
  description text not null default '' check (char_length(description) <= 280),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists raye2_collections_owner_idx on public.raye2_collections(owner_id, created_at desc);

create table if not exists public.raye2_collection_items (
  collection_id uuid not null references public.raye2_collections(id) on delete cascade,
  item_kind text not null check (item_kind in ('post','video')),
  item_id uuid not null,
  added_at timestamptz not null default now(),
  primary key (collection_id, item_kind, item_id)
);
create index if not exists raye2_collection_items_lookup_idx on public.raye2_collection_items(collection_id, added_at desc);

alter table public.raye2_collections enable row level security;
alter table public.raye2_collection_items enable row level security;

revoke all on public.raye2_collections, public.raye2_collection_items from anon, authenticated;
grant select, insert, update, delete on public.raye2_collections to authenticated;
grant select, insert, delete on public.raye2_collection_items to authenticated;

drop policy if exists "Members manage their own collections" on public.raye2_collections;
create policy "Members manage their own collections"
on public.raye2_collections for all to authenticated
using (owner_id = (select auth.uid()))
with check (owner_id = (select auth.uid()));

drop policy if exists "Members manage items in their own collections" on public.raye2_collection_items;
create policy "Members manage items in their own collections"
on public.raye2_collection_items for all to authenticated
using (exists (select 1 from public.raye2_collections c where c.id = collection_id and c.owner_id = (select auth.uid())))
with check (exists (select 1 from public.raye2_collections c where c.id = collection_id and c.owner_id = (select auth.uid())));

create or replace function public.raye2_touch_collection()
returns trigger
language plpgsql
set search_path = ''
as $fn$
begin
  new.updated_at = now();
  return new;
end;
$fn$;
revoke all on function public.raye2_touch_collection() from public, anon, authenticated;
drop trigger if exists raye2_collections_touch_updated_at on public.raye2_collections;
create trigger raye2_collections_touch_updated_at
before update on public.raye2_collections
for each row execute function public.raye2_touch_collection();

-- 4. Guarded collection RPCs. Items are restricted to the caller's own bookmarks so a
--    collection can only ever surface content the member has already saved.
create or replace function public.raye2_create_collection(p_name text, p_description text default '')
returns uuid
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_me uuid := (select auth.uid());
  v_id uuid;
begin
  if v_me is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;
  if p_name is null or char_length(btrim(p_name)) < 1 or char_length(btrim(p_name)) > 60 then
    raise exception 'collection name must be between 1 and 60 characters' using errcode = '22023';
  end if;
  if p_description is null or char_length(p_description) > 280 then
    raise exception 'collection description must be at most 280 characters' using errcode = '22023';
  end if;
  insert into public.raye2_collections(owner_id, name, description)
  values (v_me, btrim(p_name), btrim(coalesce(p_description, '')))
  returning id into v_id;
  return v_id;
end;
$fn$;
revoke all on function public.raye2_create_collection(text,text) from public, anon;
grant execute on function public.raye2_create_collection(text,text) to authenticated;

create or replace function public.raye2_add_to_collection(p_collection_id uuid, p_kind text, p_item_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_me uuid := (select auth.uid());
begin
  if v_me is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;
  if p_collection_id is null or p_item_id is null or p_kind is null then
    raise exception 'collection, kind and item are required' using errcode = '22023';
  end if;
  if p_kind not in ('post','video') then
    raise exception 'item kind must be post or video' using errcode = '22023';
  end if;
  if not exists (select 1 from public.raye2_collections where id = p_collection_id and owner_id = v_me) then
    raise exception 'collection not found' using errcode = '42501';
  end if;
  if p_kind = 'post' then
    if not exists (select 1 from public.community_bookmarks where post_id = p_item_id and user_id = v_me) then
      raise exception 'save the post before adding it to a collection' using errcode = '22023';
    end if;
  else
    if not exists (select 1 from public.video_bookmarks where media_id = p_item_id and user_id = v_me) then
      raise exception 'save the video before adding it to a collection' using errcode = '22023';
    end if;
  end if;
  insert into public.raye2_collection_items(collection_id, item_kind, item_id)
  values (p_collection_id, p_kind, p_item_id)
  on conflict (collection_id, item_kind, item_id) do nothing;
end;
$fn$;
revoke all on function public.raye2_add_to_collection(uuid,text,uuid) from public, anon;
grant execute on function public.raye2_add_to_collection(uuid,text,uuid) to authenticated;

create or replace function public.raye2_remove_from_collection(p_collection_id uuid, p_kind text, p_item_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_me uuid := (select auth.uid());
begin
  if v_me is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;
  if p_collection_id is null or p_item_id is null or p_kind is null or p_kind not in ('post','video') then
    raise exception 'collection, kind and item are required' using errcode = '22023';
  end if;
  if not exists (select 1 from public.raye2_collections where id = p_collection_id and owner_id = v_me) then
    raise exception 'collection not found' using errcode = '42501';
  end if;
  delete from public.raye2_collection_items
  where collection_id = p_collection_id and item_kind = p_kind and item_id = p_item_id;
end;
$fn$;
revoke all on function public.raye2_remove_from_collection(uuid,text,uuid) from public, anon;
grant execute on function public.raye2_remove_from_collection(uuid,text,uuid) to authenticated;

create or replace function public.raye2_get_my_collections()
returns table (id uuid, name text, description text, item_count integer, created_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_me uuid := (select auth.uid());
begin
  if v_me is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;
  return query
    select c.id, c.name, c.description, coalesce(count(i.item_id), 0)::integer, c.created_at
    from public.raye2_collections c
    left join public.raye2_collection_items i on i.collection_id = c.id
    where c.owner_id = v_me
    group by c.id, c.name, c.description, c.created_at
    order by c.created_at desc;
end;
$fn$;
revoke all on function public.raye2_get_my_collections() from public, anon;
grant execute on function public.raye2_get_my_collections() to authenticated;
