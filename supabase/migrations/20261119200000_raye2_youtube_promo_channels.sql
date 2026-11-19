-- Raye2 channel promotion catalogue: multiple channel sources managed by platform admins.
create table if not exists public.raye2_youtube_promo_channels (
  id uuid primary key default gen_random_uuid(),
  channel_url text not null,
  channel_handle text not null,
  channel_title text,
  enabled boolean not null default true,
  placements text[] not null default array['video','live','minis','community']::text[],
  last_synced_at timestamptz,
  last_sync_status text not null default 'pending' check (last_sync_status in ('pending','ok','error')),
  last_sync_error text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint raye2_youtube_channel_handle_unique unique(channel_handle),
  constraint raye2_youtube_channel_placements_check check (
    placements <@ array['video','live','minis','community']::text[]
    and cardinality(placements) > 0
  )
);
create index if not exists raye2_youtube_promo_channels_enabled_idx
  on public.raye2_youtube_promo_channels(enabled,created_at desc);
alter table public.raye2_youtube_promo_channels enable row level security;

drop policy if exists raye2_youtube_promo_channels_public_read on public.raye2_youtube_promo_channels;
create policy raye2_youtube_promo_channels_public_read on public.raye2_youtube_promo_channels
  for select to anon,authenticated using (enabled=true);

drop policy if exists raye2_youtube_promo_channels_admin_manage on public.raye2_youtube_promo_channels;
create policy raye2_youtube_promo_channels_admin_manage on public.raye2_youtube_promo_channels
  for all to authenticated using (
    exists(select 1 from public.creator_admins a where a.user_id=auth.uid() and a.active=true and a.role in ('owner','admin'))
  ) with check (
    exists(select 1 from public.creator_admins a where a.user_id=auth.uid() and a.active=true and a.role in ('owner','admin'))
  );

grant select on public.raye2_youtube_promo_channels to anon,authenticated;
grant insert,update,delete on public.raye2_youtube_promo_channels to authenticated;

insert into public.raye2_youtube_promo_channels(channel_url,channel_handle,channel_title,enabled,placements)
values('https://www.youtube.com/@maronizer','maronizer','Maronizer',true,array['video','live','minis','community']::text[])
on conflict(channel_handle) do update set
  channel_url=excluded.channel_url,
  enabled=true,
  placements=excluded.placements,
  updated_at=now();

comment on table public.raye2_youtube_promo_channels is
  'Public YouTube channel sources used for Raye2 house promotions. Admins manage channel URLs and placement scopes; no YouTube video files are downloaded.';
