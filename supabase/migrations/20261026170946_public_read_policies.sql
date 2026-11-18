-- Apply after schema.sql. These policies intentionally permit public reads only.
-- Public writes must use a server endpoint/Edge Function that validates input,
-- rate limits requests, checks poll windows/options, and never returns voter hashes.

alter table public.site_config_drafts enable row level security;
alter table public.published_site_config enable row level security;
alter table public.published_site_config_versions enable row level security;
alter table public.polls enable row level security;
alter table public.poll_options enable row level security;
alter table public.poll_votes enable row level security;
alter table public.ideas enable row level security;
alter table public.media_items enable row level security;
alter table public.events enable row level security;
alter table public.social_links enable row level security;
alter table public.admin_audit_log enable row level security;

drop policy if exists "Public can read published site config" on public.published_site_config;
create policy "Public can read published site config"
on public.published_site_config for select to anon, authenticated
using (published is not null and published <> '{}'::jsonb);

-- site_config_drafts intentionally has no client-facing policies. Its draft JSON
-- may contain unpublished copy/media/settings and is never available to public roles.
-- Historical snapshots are also private; only a validated server-side rollback
-- operation should be able to read/write published_site_config_versions.

drop policy if exists "Public can read open or closed polls" on public.polls;
create policy "Public can read open or closed polls"
on public.polls for select to anon, authenticated
using (status in ('open','closed'));

drop policy if exists "Public can read options for visible polls" on public.poll_options;
create policy "Public can read options for visible polls"
on public.poll_options for select to anon, authenticated
using (exists (
  select 1 from public.polls p
  where p.id = poll_id and p.status in ('open','closed')
));

drop policy if exists "Public can read published media" on public.media_items;
create policy "Public can read published media"
on public.media_items for select to anon, authenticated
using (is_published = true);

drop policy if exists "Public can read published events" on public.events;
create policy "Public can read published events"
on public.events for select to anon, authenticated
using (status in ('published','completed'));

drop policy if exists "Public can read published social links" on public.social_links;
create policy "Public can read published social links"
on public.social_links for select to anon, authenticated
using (is_published = true);

-- Explicitly revoke all client permissions first, then grant only public SELECT
-- on tables protected by the read policies. No public access to votes, ideas,
-- audit records, drafts, or administrative writes.
revoke all on public.site_config_drafts, public.published_site_config,
  public.published_site_config_versions, public.polls, public.poll_options,
  public.poll_votes, public.ideas, public.media_items, public.events,
  public.social_links, public.admin_audit_log from anon, authenticated;

grant select on public.published_site_config, public.polls, public.poll_options,
  public.media_items, public.events, public.social_links to anon, authenticated;

-- Before production:
-- 1. Add a trusted admin authorization model and scoped CRUD policies.
-- 2. Route vote/submission writes through validated server code with abuse controls.
-- 3. Expose vote counts only through an aggregate that never reveals voter_token_hash.
-- 4. Review Storage bucket policies and allowed MIME types/size limits.
-- 5. Run database security advisors and test anon/authenticated/admin roles.
