-- Raye2 creator-owned sponsorship campaigns for native video publishing.
-- Campaign records are configuration only: no ad is inserted or served by this migration.
create table if not exists public.raye2_creator_sponsor_campaigns (
  id uuid primary key default gen_random_uuid(),
  creator_id uuid not null references auth.users(id) on delete cascade,
  media_id uuid not null references public.media_items(id) on delete cascade,
  sponsor_asset_media_id uuid not null references public.media_items(id) on delete restrict,
  sponsor_name text not null check (char_length(btrim(sponsor_name)) between 2 and 120),
  disclosure_text text not null check (char_length(btrim(disclosure_text)) between 3 and 240),
  placement text not null default 'intro' check (placement in ('intro','midroll','outro','overlay')),
  starts_at timestamptz,
  ends_at timestamptz,
  max_per_viewer integer not null default 1 check (max_per_viewer between 1 and 5),
  status text not null default 'draft' check (status in ('draft','active','paused','completed')),
  creator_confirmed_rights boolean not null default false check (creator_confirmed_rights),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_at is null or starts_at is null or ends_at > starts_at)
);
create index if not exists raye2_creator_sponsor_campaigns_creator_idx
  on public.raye2_creator_sponsor_campaigns(creator_id,status,updated_at desc);
create index if not exists raye2_creator_sponsor_campaigns_media_idx
  on public.raye2_creator_sponsor_campaigns(media_id,status);

alter table public.raye2_creator_sponsor_campaigns enable row level security;
revoke all on public.raye2_creator_sponsor_campaigns from anon, public;
grant select,insert,update,delete on public.raye2_creator_sponsor_campaigns to authenticated;

drop policy if exists "Creators read own sponsorship campaigns" on public.raye2_creator_sponsor_campaigns;
create policy "Creators read own sponsorship campaigns"
  on public.raye2_creator_sponsor_campaigns for select to authenticated
  using (creator_id=(select auth.uid()) and public.is_nhen_video_publisher());
drop policy if exists "Creators create own sponsorship campaigns" on public.raye2_creator_sponsor_campaigns;
create policy "Creators create own sponsorship campaigns"
  on public.raye2_creator_sponsor_campaigns for insert to authenticated
  with check (creator_id=(select auth.uid()) and public.is_nhen_video_publisher());
drop policy if exists "Creators update own sponsorship campaigns" on public.raye2_creator_sponsor_campaigns;
create policy "Creators update own sponsorship campaigns"
  on public.raye2_creator_sponsor_campaigns for update to authenticated
  using (creator_id=(select auth.uid()) and public.is_nhen_video_publisher())
  with check (creator_id=(select auth.uid()) and public.is_nhen_video_publisher());
drop policy if exists "Creators delete own sponsorship campaigns" on public.raye2_creator_sponsor_campaigns;
create policy "Creators delete own sponsorship campaigns"
  on public.raye2_creator_sponsor_campaigns for delete to authenticated
  using (creator_id=(select auth.uid()) and public.is_nhen_video_publisher());

create or replace function public.raye2_validate_creator_sponsor_campaign()
returns trigger language plpgsql security definer set search_path=''
as $$
declare
  v_content_owner uuid;
  v_content_type text;
  v_sponsor_owner uuid;
  v_sponsor_type text;
  v_sponsor_public boolean;
begin
  if auth.uid() is null or new.creator_id<>(select auth.uid())
     or not public.is_nhen_video_publisher() then
    raise exception 'assigned creator access required' using errcode='42501';
  end if;

  select m.owner_id,m.media_type into v_content_owner,v_content_type
    from public.media_items m where m.id=new.media_id;
  if v_content_owner is distinct from new.creator_id
     or v_content_type not in ('video','youtube')
     or not exists(select 1 from public.video_catalog v
       where v.media_id=new.media_id and v.published_at is not null) then
    raise exception 'sponsorship must attach to your own published Raye2 video' using errcode='42501';
  end if;

  select m.owner_id,m.media_type,m.is_published
    into v_sponsor_owner,v_sponsor_type,v_sponsor_public
    from public.media_items m where m.id=new.sponsor_asset_media_id;
  if v_sponsor_owner is distinct from new.creator_id
     or v_sponsor_type<>'video' or v_sponsor_public is distinct from true then
    raise exception 'sponsor creative must be your own published video asset' using errcode='42501';
  end if;

  new.sponsor_name:=btrim(new.sponsor_name);
  new.disclosure_text:=btrim(new.disclosure_text);
  new.updated_at:=now();
  return new;
end;
$$;
revoke all on function public.raye2_validate_creator_sponsor_campaign() from public,anon,authenticated;
drop trigger if exists raye2_validate_creator_sponsor_campaign on public.raye2_creator_sponsor_campaigns;
create trigger raye2_validate_creator_sponsor_campaign
  before insert or update on public.raye2_creator_sponsor_campaigns
  for each row execute function public.raye2_validate_creator_sponsor_campaign();

comment on table public.raye2_creator_sponsor_campaigns is
  'Creator-owned sponsorship setup attached to a published native video. Configuration only; delivery and accounting are separate systems.';
