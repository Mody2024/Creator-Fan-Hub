-- NHEN Community v1: member identity, moderated posts, comments, reactions, follows and reports.
create table if not exists public.member_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  handle text not null unique check (handle ~ '^[a-z0-9_]{3,24}$'),
  display_name text not null default 'New member' check (char_length(display_name) between 1 and 40),
  bio text not null default '' check (char_length(bio) <= 240),
  avatar_url text,
  website_url text,
  visibility text not null default 'public' check (visibility in ('public','private')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.community_posts (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references auth.users(id) on delete cascade,
  post_type text not null default 'member' check (post_type in ('member','official')),
  body text not null check (char_length(btrim(body)) between 1 and 2000),
  media_url text,
  linked_video_id uuid references public.media_items(id) on delete set null,
  status text not null default 'pending' check (status in ('pending','published','rejected','removed')),
  pinned boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists community_posts_feed_idx on public.community_posts(status, pinned desc, created_at desc);
create index if not exists community_posts_author_idx on public.community_posts(author_id, created_at desc);

create table if not exists public.community_comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.community_posts(id) on delete cascade,
  author_id uuid not null references auth.users(id) on delete cascade,
  body text not null check (char_length(btrim(body)) between 1 and 1000),
  status text not null default 'pending' check (status in ('pending','published','rejected','removed')),
  created_at timestamptz not null default now()
);
create index if not exists community_comments_post_idx on public.community_comments(post_id, created_at asc);

create table if not exists public.community_reactions (
  post_id uuid not null references public.community_posts(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  reaction text not null default 'like' check (reaction in ('like','love','insightful','funny')),
  created_at timestamptz not null default now(),
  primary key (post_id,user_id)
);

create table if not exists public.member_follows (
  follower_id uuid not null references auth.users(id) on delete cascade,
  followed_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (follower_id,followed_id),
  check (follower_id <> followed_id)
);

create table if not exists public.content_reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references auth.users(id) on delete cascade,
  target_type text not null check (target_type in ('post','comment','profile')),
  target_id text not null,
  reason text not null check (reason in ('spam','harassment','hate','impersonation','copyright','other')),
  details text not null default '' check (char_length(details) <= 500),
  status text not null default 'open' check (status in ('open','reviewing','resolved','dismissed')),
  created_at timestamptz not null default now()
);
create index if not exists content_reports_queue_idx on public.content_reports(status,created_at desc);

create table if not exists public.member_blocks (
  blocker_id uuid not null references auth.users(id) on delete cascade,
  blocked_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id,blocked_id),
  check (blocker_id <> blocked_id)
);

-- Provision a non-sensitive default profile for each new authenticated member.
create or replace function public.create_member_profile()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  insert into public.member_profiles(user_id,handle,display_name)
  values (new.id, 'member_' || replace(substr(new.id::text,1,8),'-',''), 'New member')
  on conflict (user_id) do nothing;
  return new;
end;
$;
revoke all on function public.create_member_profile() from public, anon, authenticated;
grant execute on function public.create_member_profile() to postgres;
drop trigger if exists on_auth_user_created_member_profile on auth.users;
create trigger on_auth_user_created_member_profile
after insert on auth.users for each row execute function public.create_member_profile();

create or replace function public.touch_member_profile()
returns trigger language plpgsql set search_path = ''
as $$ begin new.updated_at = now(); return new; end; $$;
drop trigger if exists member_profiles_touch_updated_at on public.member_profiles;
create trigger member_profiles_touch_updated_at before update on public.member_profiles
for each row execute function public.touch_member_profile();

alter table public.member_profiles enable row level security;
alter table public.community_posts enable row level security;
alter table public.community_comments enable row level security;
alter table public.community_reactions enable row level security;
alter table public.member_follows enable row level security;
alter table public.content_reports enable row level security;
alter table public.member_blocks enable row level security;

revoke all on public.member_profiles,public.community_posts,public.community_comments,
 public.community_reactions,public.member_follows,public.content_reports,public.member_blocks
 from anon,authenticated;
grant select on public.member_profiles,public.community_posts,public.community_comments,
 public.community_reactions,public.member_follows to anon,authenticated;
grant insert,update on public.member_profiles to authenticated;
grant insert,update,delete on public.community_posts,public.community_comments to authenticated;
grant insert,delete on public.community_reactions,public.member_follows,public.member_blocks to authenticated;
grant select,insert on public.content_reports to authenticated;
grant select,insert,update,delete on public.member_blocks to authenticated;

create policy "Public profiles visible unless private"
on public.member_profiles for select to anon,authenticated
using (visibility = 'public' or user_id = (select auth.uid()) or public.is_active_creator());
create policy "Members create own profile"
on public.member_profiles for insert to authenticated
with check (user_id = (select auth.uid()));
create policy "Members update own profile"
on public.member_profiles for update to authenticated
using (user_id = (select auth.uid()))
with check (user_id = (select auth.uid()));

create policy "Published posts visible"
on public.community_posts for select to anon,authenticated
using (status = 'published' or author_id = (select auth.uid()) or public.is_active_creator());
create policy "Members submit moderated posts"
on public.community_posts for insert to authenticated
with check (author_id = (select auth.uid()) and post_type = 'member' and status = 'pending' and pinned = false);
create policy "Members edit own pending posts"
on public.community_posts for update to authenticated
using (author_id = (select auth.uid()) and status = 'pending')
with check (author_id = (select auth.uid()) and status = 'pending' and post_type = 'member' and pinned = false);
create policy "Creators moderate posts"
on public.community_posts for all to authenticated
using (public.is_active_creator()) with check (public.is_active_creator());

create policy "Published comments visible"
on public.community_comments for select to anon,authenticated
using (status = 'published' or author_id = (select auth.uid()) or public.is_active_creator());
create policy "Members submit moderated comments"
on public.community_comments for insert to authenticated
with check (author_id = (select auth.uid()) and status = 'pending');
create policy "Members edit own pending comments"
on public.community_comments for update to authenticated
using (author_id = (select auth.uid()) and status = 'pending')
with check (author_id = (select auth.uid()) and status = 'pending');
create policy "Creators moderate comments"
on public.community_comments for all to authenticated
using (public.is_active_creator()) with check (public.is_active_creator());

create policy "Reactions visible on published posts"
on public.community_reactions for select to anon,authenticated
using (exists(select 1 from public.community_posts p where p.id=post_id and p.status='published'));
create policy "Members add own reaction"
on public.community_reactions for insert to authenticated
with check (user_id = (select auth.uid()) and exists(select 1 from public.community_posts p where p.id=post_id and p.status='published'));
create policy "Members remove own reaction"
on public.community_reactions for delete to authenticated using (user_id = (select auth.uid()));

create policy "Public follows visible"
on public.member_follows for select to anon,authenticated using (true);
create policy "Members follow others"
on public.member_follows for insert to authenticated with check (follower_id = (select auth.uid()));
create policy "Members unfollow"
on public.member_follows for delete to authenticated using (follower_id = (select auth.uid()));

create policy "Members submit reports"
on public.content_reports for insert to authenticated with check (reporter_id = (select auth.uid()));
create policy "Creators review reports"
on public.content_reports for select to authenticated using (public.is_active_creator());
create policy "Creators update reports"
on public.content_reports for update to authenticated using (public.is_active_creator()) with check (public.is_active_creator());

create policy "Members view own blocks"
on public.member_blocks for select to authenticated using (blocker_id = (select auth.uid()));
create policy "Members block"
on public.member_blocks for insert to authenticated with check (blocker_id = (select auth.uid()));
create policy "Members unblock"
on public.member_blocks for delete to authenticated using (blocker_id = (select auth.uid()));

-- Community member profiles are provisioned by the auth trigger; no public role can create admin privileges.
