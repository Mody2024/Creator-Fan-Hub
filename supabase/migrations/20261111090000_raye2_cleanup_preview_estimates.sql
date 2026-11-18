-- Raye2 Wave 8 / plan 13.10: the cleanup preview must show affected records, estimated storage and exclusions.
--
-- Plan 13.10 requires a destructive bulk action to preview affected records, estimated storage, exclusions,
-- reason and recovery options before confirmation. raye2_create_cleanup_preview recorded the scope, the
-- preservation flags and the reason, but it never computed or stored the affected-record count or estimated
-- storage; those only appeared after a separate queue step. The admin UI showed "—" for both at preview time.

create or replace function public.raye2_create_cleanup_preview(
  p_scope jsonb,p_preserve_chat_history boolean,p_preserve_shared_memories boolean,p_reason text
)
returns uuid language plpgsql security definer set search_path=''
as $$
declare v_id uuid; v_items bigint; v_bytes bigint; v_breakdown jsonb;
begin
  if auth.uid() is null or not public.raye2_is_platform_admin() then
    raise exception 'platform admin access required' using errcode='42501';
  end if;
  if jsonb_typeof(p_scope)<>'array' or jsonb_array_length(p_scope)=0 or octet_length(p_scope::text)>4096
    or char_length(btrim(coalesce(p_reason,''))) not between 3 and 500 then
    raise exception 'cleanup scope and reason are required' using errcode='22023';
  end if;
  -- Estimate the whole scope now, so the reviewer sees affected records and estimated storage before queueing.
  select e.items, e.bytes into v_items, v_bytes
    from public.raye2_estimate_cleanup_scope(p_scope, coalesce(p_preserve_chat_history,true), coalesce(p_preserve_shared_memories,true)) e;
  select coalesce(jsonb_object_agg(category, jsonb_build_object(
           'candidates', cands, 'bytes', bytes, 'enabled', enabled, 'action', action)), '{}'::jsonb)
    into v_breakdown
    from (
      select cat.category,
             coalesce((select count(*) from public.raye2_cleanup_candidates(cat.category, pol.retention_days,
               coalesce(p_preserve_chat_history,true), coalesce(p_preserve_shared_memories,true)) c), 0) as cands,
             coalesce((select sum(c.bytes) from public.raye2_cleanup_candidates(cat.category, pol.retention_days,
               coalesce(p_preserve_chat_history,true), coalesce(p_preserve_shared_memories,true)) c), 0) as bytes,
             coalesce(pol.enabled,false) as enabled,
             pol.expiry_action as action
      from (select jsonb_array_elements_text(p_scope) as category) cat
      left join public.raye2_retention_policies pol on pol.category = cat.category
    ) parts;
  insert into public.raye2_cleanup_jobs(requested_by,status,scope,preserve_chat_history,preserve_shared_memories,
      estimated_items,estimated_bytes,result,reason)
  values(auth.uid(),'preview',p_scope,coalesce(p_preserve_chat_history,true),coalesce(p_preserve_shared_memories,true),
      v_items,v_bytes,
      jsonb_build_object('exclusions',jsonb_build_object(
        'chat_history',coalesce(p_preserve_chat_history,true),
        'shared_memories',coalesce(p_preserve_shared_memories,true)),
        'categories',v_breakdown),
      btrim(p_reason))
  returning id into v_id;
  insert into public.raye2_admin_audit_log(actor_id,action,target_type,target_id,reason,details)
  values(auth.uid(),'cleanup_preview_created','cleanup_job',v_id::text,btrim(p_reason),
    jsonb_build_object('scope',p_scope,'preserve_chat_history',p_preserve_chat_history,
      'preserve_shared_memories',p_preserve_shared_memories,'estimated_items',v_items,'estimated_bytes',v_bytes));
  return v_id;
end;
$$;
revoke all on function public.raye2_create_cleanup_preview(jsonb,boolean,boolean,text) from public,anon;
grant execute on function public.raye2_create_cleanup_preview(jsonb,boolean,boolean,text) to authenticated;

notify pgrst, 'reload schema';
