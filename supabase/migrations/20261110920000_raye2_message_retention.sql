-- Raye2 Wave 6: Admin-configurable message retention with a safe, automatic sweep.
--
-- Plan Wave 6 requires automatic cleanup of messages that follows independent Admin-configurable retention
-- clocks. The retention policies and the admin cleanup-job toolkit already existed, but nothing ever removed
-- expired messages automatically: raye2_run_maintenance only expired minis/moments/clips/memories, and the
-- cleanup executor deleted only when a job was created and run by hand.
--
-- This adds an automatic sweep driven by the enabled retention policies. It is deliberately conservative:
--   * nothing is deleted unless the category policy is enabled with an explicit retention_days;
--   * messages that back a preserved Shared Memory are never removed;
--   * messages in a group that is not active (archived/read_only/expired) are skipped so archived history is kept;
--   * direct and group message clocks are independent.

-- 1. Sweep expired messages for one policy category. Returns the number of messages removed.
create or replace function public.raye2_sweep_message_retention(p_category text)
returns integer language plpgsql security definer set search_path=''
as $$
declare v_policy public.raye2_retention_policies%rowtype; v_cutoff timestamptz; v_removed integer := 0;
begin
  if p_category not in ('direct_messages','group_messages') then
    raise exception 'invalid message retention category' using errcode='22023';
  end if;
  select * into v_policy from public.raye2_retention_policies where category=p_category;
  if not found or not v_policy.enabled or v_policy.retention_days is null or v_policy.expiry_action <> 'delete' then
    return 0;
  end if;
  v_cutoff := now() - (v_policy.retention_days || ' days')::interval;
  with removed as (
    delete from public.raye2_messages m
    where m.created_at < v_cutoff
      and m.conversation_id in (
        select c.id from public.raye2_conversations c
        where c.conversation_type = case when p_category='direct_messages' then 'direct' else 'group' end
          and (c.group_id is null or exists(
            select 1 from public.raye2_groups g where g.id=c.group_id and g.status='active'))
      )
      and (v_policy.preserve_shared_memories is not true or not exists(
        select 1 from public.raye2_shared_memories sm
        where sm.source_message_id=m.id and sm.retention_mode='preserved'))
    returning 1)
  select count(*) into v_removed from removed;
  if v_removed > 0 then
    insert into public.raye2_admin_audit_log(actor_id,action,target_type,target_id,reason,details)
    values(auth.uid(),'message_retention_sweep','retention_policy',p_category,'Automatic message retention sweep',
           jsonb_build_object('category',p_category,'removed',v_removed,'retention_days',v_policy.retention_days));
  end if;
  return v_removed;
end;
$$;
revoke all on function public.raye2_sweep_message_retention(text) from public, anon;
grant execute on function public.raye2_sweep_message_retention(text) to authenticated;

-- 2. Fold both message clocks into the maintenance runner, preserving the existing keys.
create or replace function public.raye2_run_maintenance()
returns jsonb language plpgsql security definer set search_path=''
as $$
declare
  v_minis integer := -1; v_moments integer := -1; v_clips integer := -1; v_memories integer := -1;
  v_direct integer := -1; v_group integer := -1;
begin
  begin v_minis := public.raye2_expire_minis(); exception when others then v_minis := -1; end;
  begin v_moments := public.raye2_expire_moments(); exception when others then v_moments := -1; end;
  begin v_clips := public.raye2_expire_community_clips(); exception when others then v_clips := -1; end;
  begin v_memories := public.raye2_expire_shared_memories(); exception when others then v_memories := -1; end;
  begin v_direct := public.raye2_sweep_message_retention('direct_messages'); exception when others then v_direct := -1; end;
  begin v_group := public.raye2_sweep_message_retention('group_messages'); exception when others then v_group := -1; end;
  return jsonb_build_object('minis_expired', v_minis, 'moments_expired', v_moments,
    'clips_expired', v_clips, 'shared_memories_expired', v_memories,
    'direct_messages_expired', v_direct, 'group_messages_expired', v_group, 'ran_at', now());
end;
$$;
revoke all on function public.raye2_run_maintenance() from public;
grant execute on function public.raye2_run_maintenance() to anon, authenticated;

notify pgrst, 'reload schema';
