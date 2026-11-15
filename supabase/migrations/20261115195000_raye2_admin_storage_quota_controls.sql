-- Admin-controlled personal storage limits, bounded by the global safety policy.
create or replace function public.raye2_admin_set_user_storage_quota(
 p_user_id uuid,p_quota_bytes bigint,p_reason text default ''
) returns boolean
language plpgsql security definer set search_path=''
as $$
begin
 if auth.uid() is null or not public.raye2_is_platform_admin() then
   raise exception 'platform admin access required' using errcode='42501';
 end if;
 if p_user_id is null
   or (p_quota_bytes is not null and p_quota_bytes not between 0 and 10737418240)
   or length(coalesce(p_reason,''))>500 then
   raise exception 'invalid user storage quota' using errcode='22023';
 end if;

 if p_quota_bytes is null then
   delete from public.raye2_user_storage_quota_overrides where user_id=p_user_id;
 else
   insert into public.raye2_user_storage_quota_overrides(user_id,quota_bytes,reason,updated_by)
   values(p_user_id,p_quota_bytes,left(coalesce(p_reason,''),500),auth.uid())
   on conflict(user_id) do update set
     quota_bytes=excluded.quota_bytes,
     reason=excluded.reason,
     updated_by=excluded.updated_by,
     updated_at=now();
 end if;

 insert into public.raye2_admin_audit_log(actor_id,action,target_type,target_id,reason,details)
 values(auth.uid(),'user_storage_quota_set','member',p_user_id::text,
   nullif(left(coalesce(p_reason,''),500),''),
   jsonb_build_object('quota_bytes',p_quota_bytes,'reset_to_role_default',p_quota_bytes is null));
 return true;
end;
$$;
revoke all on function public.raye2_admin_set_user_storage_quota(uuid,bigint,text) from public,anon;
grant execute on function public.raye2_admin_set_user_storage_quota(uuid,bigint,text) to authenticated;

-- Remove the legacy 32-bit overload so PostgREST has one unambiguous admin RPC.
drop function if exists public.raye2_set_role_quota(text,text,integer);

-- Prevent a platform admin from configuring an individual role tier above the
-- same 10 GiB hard ceiling used by per-user overrides.
create or replace function public.raye2_set_role_quota(p_tier text,p_metric text,p_limit bigint)
returns void language plpgsql security definer set search_path=''
as $$
begin
 if not public.raye2_is_platform_admin() then
   raise exception 'platform admin access required' using errcode='42501';
 end if;
 if p_limit is null or p_limit<0 then
   raise exception 'limit must be zero or greater' using errcode='22023';
 end if;
 if p_metric='storage_bytes' and p_limit>10737418240 then
   raise exception 'storage tier limit cannot exceed 10 GiB' using errcode='22023';
 end if;
 update public.raye2_role_quotas
 set limit_value=p_limit,updated_at=now()
 where tier=p_tier and metric=p_metric;
 if not found then raise exception 'unknown tier or metric' using errcode='22023'; end if;
 insert into public.raye2_admin_audit_log(actor_id,action,target_type,target_id,reason,details)
 values(auth.uid(),'role_quota_set','role_quota',p_tier||'.'||p_metric,p_limit::text,
   jsonb_build_object('tier',p_tier,'metric',p_metric,'limit',p_limit));
end;
$$;
revoke all on function public.raye2_set_role_quota(text,text,integer) from public,anon;
grant execute on function public.raye2_set_role_quota(text,text,integer) to authenticated;

notify pgrst,'reload schema';
