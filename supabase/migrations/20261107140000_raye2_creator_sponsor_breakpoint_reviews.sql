-- Creator reviewable sponsor breakpoints. These are review annotations, never ad-delivery commands.
create table if not exists public.raye2_creator_sponsor_breakpoints (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.raye2_creator_sponsor_campaigns(id) on delete cascade,
  creator_id uuid not null references auth.users(id) on delete cascade,
  at_seconds integer not null check (at_seconds >= 0),
  decision text not null check (decision in ('approve','exclude')),
  note text not null default '' check (char_length(note) <= 240),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(campaign_id,at_seconds)
);
create index if not exists raye2_creator_sponsor_breakpoints_campaign_idx
  on public.raye2_creator_sponsor_breakpoints(campaign_id,at_seconds);
alter table public.raye2_creator_sponsor_breakpoints enable row level security;
revoke all on public.raye2_creator_sponsor_breakpoints from public,anon;
grant select,insert,update,delete on public.raye2_creator_sponsor_breakpoints to authenticated;

drop policy if exists "Creators manage own sponsor breakpoint reviews" on public.raye2_creator_sponsor_breakpoints;
create policy "Creators manage own sponsor breakpoint reviews"
  on public.raye2_creator_sponsor_breakpoints for all to authenticated
  using (creator_id=(select auth.uid()) and public.is_nhen_video_publisher()
    and exists(select 1 from public.raye2_creator_sponsor_campaigns c
      where c.id=campaign_id and c.creator_id=(select auth.uid())))
  with check (creator_id=(select auth.uid()) and public.is_nhen_video_publisher()
    and exists(select 1 from public.raye2_creator_sponsor_campaigns c
      where c.id=campaign_id and c.creator_id=(select auth.uid())));

create or replace function public.raye2_validate_creator_sponsor_breakpoint()
returns trigger language plpgsql security definer set search_path=''
as $$
declare v_owner uuid;v_media uuid;v_duration integer;v_published timestamptz;
begin
 if auth.uid() is null or new.creator_id<>(select auth.uid())
    or not public.is_nhen_video_publisher() then
   raise exception 'assigned creator access required' using errcode='42501';
 end if;
 select c.creator_id,c.media_id,v.duration_seconds,v.published_at
   into v_owner,v_media,v_duration,v_published
 from public.raye2_creator_sponsor_campaigns c
 join public.video_catalog v on v.media_id=c.media_id
 where c.id=new.campaign_id;
 if v_owner is distinct from new.creator_id or v_published is null then
   raise exception 'breakpoint review must belong to your published video campaign' using errcode='42501';
 end if;
 if v_duration is null or new.at_seconds>=v_duration then
   raise exception 'breakpoint must be within the published video duration' using errcode='22023';
 end if;
 new.note:=btrim(coalesce(new.note,''));
 new.updated_at:=now();
 return new;
end;
$$;
revoke all on function public.raye2_validate_creator_sponsor_breakpoint() from public,anon,authenticated;
drop trigger if exists raye2_validate_creator_sponsor_breakpoint on public.raye2_creator_sponsor_breakpoints;
create trigger raye2_validate_creator_sponsor_breakpoint
 before insert or update on public.raye2_creator_sponsor_breakpoints
 for each row execute function public.raye2_validate_creator_sponsor_breakpoint();
