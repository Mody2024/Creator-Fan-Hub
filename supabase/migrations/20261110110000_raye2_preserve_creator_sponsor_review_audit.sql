-- Preserve review evidence and prevent submitted campaigns from erasing their audit trail.
create or replace function public.raye2_reject_sponsor_review_event_mutation()
returns trigger language plpgsql security definer set search_path=''
as $$
begin
 raise exception 'sponsor review history is append-only' using errcode='42501';
end;
$$;
revoke all on function public.raye2_reject_sponsor_review_event_mutation() from public,anon,authenticated;
drop trigger if exists raye2_sponsor_review_events_no_update on public.raye2_creator_sponsor_review_events;
create trigger raye2_sponsor_review_events_no_update
 before update or delete on public.raye2_creator_sponsor_review_events
 for each row execute function public.raye2_reject_sponsor_review_event_mutation();

create or replace function public.raye2_guard_creator_sponsor_campaign_delete()
returns trigger language plpgsql security definer set search_path=''
as $$
begin
 if old.approval_status<>'not_submitted' or exists(
  select 1 from public.raye2_creator_sponsor_review_events e where e.campaign_id=old.id
 ) then
  raise exception 'reviewed campaigns must be retained for audit history' using errcode='42501';
 end if;
 return old;
end;
$$;
revoke all on function public.raye2_guard_creator_sponsor_campaign_delete() from public,anon,authenticated;
drop trigger if exists raye2_guard_creator_sponsor_campaign_delete on public.raye2_creator_sponsor_campaigns;
create trigger raye2_guard_creator_sponsor_campaign_delete
 before delete on public.raye2_creator_sponsor_campaigns
 for each row execute function public.raye2_guard_creator_sponsor_campaign_delete();
