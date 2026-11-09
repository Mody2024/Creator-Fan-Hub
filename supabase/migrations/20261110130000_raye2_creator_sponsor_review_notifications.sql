-- Creator-facing notifications for sponsor contract review outcomes.
-- Notifications are created atomically with the review decision and audit event.
create table if not exists public.raye2_creator_notifications (
 id uuid primary key default gen_random_uuid(),
 creator_id uuid not null references auth.users(id) on delete cascade,
 campaign_id uuid not null references public.raye2_creator_sponsor_campaigns(id) on delete restrict,
 review_event_id uuid not null unique references public.raye2_creator_sponsor_review_events(id) on delete restrict,
 notification_type text not null check(notification_type in ('sponsor_review_approved','sponsor_review_rejected')),
 title text not null check(char_length(title) between 1 and 160),
 body text not null check(char_length(body) between 1 and 500),
 created_at timestamptz not null default now(),
 read_at timestamptz
);
create index if not exists raye2_creator_notifications_inbox_idx
 on public.raye2_creator_notifications(creator_id,created_at desc);
alter table public.raye2_creator_notifications enable row level security;
revoke all on public.raye2_creator_notifications from public,anon,authenticated;
grant select on public.raye2_creator_notifications to authenticated;
drop policy if exists "Creators read their own Raye2 notifications" on public.raye2_creator_notifications;
create policy "Creators read their own Raye2 notifications"
 on public.raye2_creator_notifications for select to authenticated
 using(creator_id=(select auth.uid()) and public.is_nhen_video_publisher());

create or replace function public.raye2_mark_creator_notification_read(p_notification_id uuid)
returns boolean language plpgsql security definer set search_path=''
as $$
declare v_updated integer;
begin
 if auth.uid() is null or not public.is_nhen_video_publisher() then
  raise exception 'assigned creator access required' using errcode='42501';
 end if;
 update public.raye2_creator_notifications set read_at=coalesce(read_at,now())
 where id=p_notification_id and creator_id=(select auth.uid());
 get diagnostics v_updated=row_count;
 return v_updated=1;
end;
$$;
revoke all on function public.raye2_mark_creator_notification_read(uuid) from public,anon;
grant execute on function public.raye2_mark_creator_notification_read(uuid) to authenticated;

create or replace function public.raye2_admin_review_creator_sponsor(
 p_campaign_id uuid,p_decision text,p_note text default ''
) returns jsonb language plpgsql security definer set search_path=''
as $$
declare v_campaign public.raye2_creator_sponsor_campaigns%rowtype;
 v_event_id uuid;
 v_decision text:=lower(btrim(coalesce(p_decision,'')));
 v_note text:=btrim(coalesce(p_note,''));
begin
 if auth.uid() is null or not exists(select 1 from public.creator_admins a
  where a.user_id=(select auth.uid()) and a.active=true and a.role in ('owner','admin')) then
  raise exception 'owner or admin access required' using errcode='42501';
 end if;
 if v_decision not in ('approved','rejected') then raise exception 'decision must be approved or rejected' using errcode='22023'; end if;
 if char_length(v_note)>500 then raise exception 'review note is too long' using errcode='22023'; end if;
 select * into v_campaign from public.raye2_creator_sponsor_campaigns
  where id=p_campaign_id for update;
 if not found then raise exception 'campaign not found' using errcode='P0002'; end if;
 if v_campaign.approval_status<>'pending' or v_campaign.status<>'draft' then
  raise exception 'only pending draft campaigns can be reviewed' using errcode='22023';
 end if;
 perform set_config('app.raye2_sponsor_review_rpc','on',true);
 update public.raye2_creator_sponsor_campaigns
  set approval_status=v_decision,approval_reviewed_at=now(),
      approval_reviewed_by=(select auth.uid()),approval_note=v_note
  where id=p_campaign_id;
 insert into public.raye2_creator_sponsor_review_events(campaign_id,creator_id,actor_id,event_type,note)
 values(p_campaign_id,v_campaign.creator_id,(select auth.uid()),v_decision,v_note)
 returning id into v_event_id;
 insert into public.raye2_creator_notifications(creator_id,campaign_id,review_event_id,notification_type,title,body)
 values(
  v_campaign.creator_id,p_campaign_id,v_event_id,'sponsor_review_'||v_decision,
  case when v_decision='approved' then 'Sponsorship review approved' else 'Sponsorship review rejected' end,
  case when v_decision='approved'
   then 'Your sponsor campaign contract review was approved. This does not activate ad delivery.'
   else 'Your sponsor campaign was rejected. Open the campaign review history to read the reviewer note and make changes.'
  end
 );
 return jsonb_build_object('campaign_id',p_campaign_id,'approval_status',v_decision,'delivery_enabled',false);
end;
$$;
revoke all on function public.raye2_admin_review_creator_sponsor(uuid,text,text) from public,anon;
grant execute on function public.raye2_admin_review_creator_sponsor(uuid,text,text) to authenticated;
