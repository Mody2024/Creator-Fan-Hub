-- Allow only the two SECURITY DEFINER review RPCs to mutate guarded review fields.
-- The transaction-local marker cannot be persisted beyond the current RPC transaction.
create or replace function public.raye2_guard_creator_sponsor_review_fields()
returns trigger language plpgsql security definer set search_path=''
as $$
begin
 if (new.approval_status,new.approval_requested_at,new.approval_reviewed_at,
     new.approval_reviewed_by,new.approval_note)
    is distinct from
    (old.approval_status,old.approval_requested_at,old.approval_reviewed_at,
     old.approval_reviewed_by,old.approval_note)
    and coalesce(current_setting('app.raye2_sponsor_review_rpc',true),'')<>'on' then
   raise exception 'sponsor review fields can only be changed through the review workflow' using errcode='42501';
 end if;
 return new;
end;
$$;
revoke all on function public.raye2_guard_creator_sponsor_review_fields() from public,anon,authenticated;

create or replace function public.raye2_request_creator_sponsor_review(p_campaign_id uuid)
returns jsonb language plpgsql security definer set search_path=''
as $$
declare v_campaign public.raye2_creator_sponsor_campaigns%rowtype;
begin
 if auth.uid() is null or not public.is_nhen_video_publisher() then
  raise exception 'assigned creator access required' using errcode='42501';
 end if;
 select * into v_campaign from public.raye2_creator_sponsor_campaigns
  where id=p_campaign_id and creator_id=(select auth.uid()) for update;
 if not found then raise exception 'campaign not found' using errcode='P0002'; end if;
 if v_campaign.status<>'draft' then raise exception 'only draft campaigns can be submitted for review' using errcode='22023'; end if;
 if v_campaign.approval_status not in ('not_submitted','rejected') then
  raise exception 'campaign is already submitted or approved' using errcode='22023';
 end if;
 perform set_config('app.raye2_sponsor_review_rpc','on',true);
 update public.raye2_creator_sponsor_campaigns
  set approval_status='pending',approval_requested_at=now(),approval_reviewed_at=null,
      approval_reviewed_by=null,approval_note=''
  where id=p_campaign_id;
 insert into public.raye2_creator_sponsor_review_events(campaign_id,creator_id,actor_id,event_type,note)
 values(p_campaign_id,v_campaign.creator_id,(select auth.uid()),
  case when v_campaign.approval_status='rejected' then 'resubmitted' else 'review_requested' end,'');
 return jsonb_build_object('campaign_id',p_campaign_id,'approval_status','pending','delivery_enabled',false);
end;
$$;

create or replace function public.raye2_admin_review_creator_sponsor(
 p_campaign_id uuid,p_decision text,p_note text default ''
) returns jsonb language plpgsql security definer set search_path=''
as $$
declare v_campaign public.raye2_creator_sponsor_campaigns%rowtype;
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
 values(p_campaign_id,v_campaign.creator_id,(select auth.uid()),v_decision,v_note);
 return jsonb_build_object('campaign_id',p_campaign_id,'approval_status',v_decision,'delivery_enabled',false);
end;
$$;
revoke all on function public.raye2_request_creator_sponsor_review(uuid) from public,anon;
grant execute on function public.raye2_request_creator_sponsor_review(uuid) to authenticated;
revoke all on function public.raye2_admin_review_creator_sponsor(uuid,text,text) from public,anon;
grant execute on function public.raye2_admin_review_creator_sponsor(uuid,text,text) to authenticated;
