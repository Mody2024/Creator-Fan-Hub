-- Raye2 Wave 6: group profile editing and a group moderation log.
--
-- The companion plan section 3 lists "group description, image, rules, topics, pinned messages and announcements"
-- plus "member removal and moderation logs". The group table already carried description/image_url/rules/topics but
-- nothing ever edited them after creation, and there was no moderation log. Additive; main and production unchanged.

-- 1. Manager-only group profile editing with the same validation as creation.
create or replace function public.raye2_update_group_profile(
  p_group_id uuid, p_description text default null, p_image_url text default null,
  p_rules text default null, p_topics text[] default null)
returns void language plpgsql security definer set search_path=''
as $$
declare v_topics text[] := null;
begin
  if auth.uid() is null or not public.raye2_is_group_manager(p_group_id) then
    raise exception 'group manager permission required' using errcode='42501';
  end if;
  if p_description is not null and char_length(p_description) > 1000 then
    raise exception 'group description must be at most 1000 characters' using errcode='22023';
  end if;
  if p_rules is not null and char_length(p_rules) > 3000 then
    raise exception 'group rules must be at most 3000 characters' using errcode='22023';
  end if;
  if p_image_url is not null then
    if p_image_url <> '' and p_image_url !~* '^https://' then
      raise exception 'group image must be an https URL' using errcode='22023';
    end if;
    if char_length(p_image_url) > 600 then
      raise exception 'group image URL is too long' using errcode='22023';
    end if;
  end if;
  if p_topics is not null then
    if array_length(p_topics,1) > 12 then
      raise exception 'at most 12 group topics are allowed' using errcode='22023';
    end if;
    select array_agg(btrim(t)) into v_topics from unnest(p_topics) as t
      where btrim(t) <> '' and char_length(btrim(t)) <= 40;
  end if;
  update public.raye2_groups set
    description = coalesce(p_description, description),
    image_url = case when p_image_url is null then image_url when p_image_url = '' then null else p_image_url end,
    rules = coalesce(p_rules, rules),
    topics = coalesce(v_topics, topics),
    updated_at = now()
  where id = p_group_id;
end;
$$;
revoke all on function public.raye2_update_group_profile(uuid,text,text,text,text[]) from public, anon;
grant execute on function public.raye2_update_group_profile(uuid,text,text,text,text[]) to authenticated;

-- 2. Moderation log. Written by a trigger so every membership/status/ownership change is captured without
--    re-creating each action RPC. Actor is the caller; service-role actions record a null actor.
create table if not exists public.raye2_group_moderation_log (
  id bigint generated always as identity primary key,
  group_id uuid not null references public.raye2_groups(id) on delete cascade,
  actor_id uuid references auth.users(id) on delete set null,
  action text not null check (char_length(action) between 1 and 40),
  target_user_id uuid references auth.users(id) on delete set null,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists raye2_group_moderation_log_group_idx
  on public.raye2_group_moderation_log(group_id,created_at desc);
alter table public.raye2_group_moderation_log enable row level security;
revoke all on public.raye2_group_moderation_log from anon, authenticated;
grant select on public.raye2_group_moderation_log to authenticated;

drop policy if exists "Raye2 group managers read the moderation log" on public.raye2_group_moderation_log;
create policy "Raye2 group managers read the moderation log" on public.raye2_group_moderation_log for select to authenticated
using (public.raye2_is_group_manager(group_id));

create or replace function public.raye2_log_group_moderation()
returns trigger language plpgsql security definer set search_path=''
as $$
declare v_group uuid; v_action text; v_target uuid; v_details jsonb := '{}'::jsonb;
begin
  if tg_table_name = 'raye2_group_members' then
    v_group := coalesce(new.group_id, old.group_id);
    v_target := coalesce(new.user_id, old.user_id);
    if tg_op = 'INSERT' then
      v_action := 'member_added';
      v_details := jsonb_build_object('role', new.role, 'status', new.status);
    elsif tg_op = 'DELETE' then
      v_action := 'member_removed';
      v_details := jsonb_build_object('role', old.role, 'status', old.status);
    else
      if new.role is distinct from old.role then
        v_action := 'role_changed';
        v_details := jsonb_build_object('from', old.role, 'to', new.role);
      elsif new.status is distinct from old.status then
        v_action := case when new.status = 'banned' then 'member_banned'
                         when old.status = 'banned' then 'member_unbanned'
                         else 'member_status_changed' end;
        v_details := jsonb_build_object('from', old.status, 'to', new.status);
      else
        return new;
      end if;
    end if;
  else
    v_group := new.id;
    if new.owner_id is distinct from old.owner_id then
      v_action := 'ownership_transferred';
      v_target := new.owner_id;
      v_details := jsonb_build_object('previous_owner', old.owner_id);
    elsif new.status is distinct from old.status then
      v_action := 'group_status_changed';
      v_details := jsonb_build_object('from', old.status, 'to', new.status);
    else
      return new;
    end if;
  end if;
  insert into public.raye2_group_moderation_log(group_id,actor_id,action,target_user_id,details)
  values(v_group,auth.uid(),v_action,v_target,v_details);
  return new;
end;
$$;
revoke all on function public.raye2_log_group_moderation() from public, anon, authenticated;
drop trigger if exists raye2_group_members_moderation on public.raye2_group_members;
create trigger raye2_group_members_moderation after insert or update or delete on public.raye2_group_members
for each row execute function public.raye2_log_group_moderation();
drop trigger if exists raye2_groups_moderation on public.raye2_groups;
create trigger raye2_groups_moderation after update on public.raye2_groups
for each row execute function public.raye2_log_group_moderation();

-- 3. Manager-only read of the log, newest first.
create or replace function public.raye2_list_group_moderation_log(p_group_id uuid, p_limit integer default 60)
returns table(id bigint, action text, actor_id uuid, target_user_id uuid, details jsonb, created_at timestamptz)
language plpgsql security definer set search_path=''
as $$
begin
  if auth.uid() is null or not public.raye2_is_group_manager(p_group_id) then
    raise exception 'group manager permission required' using errcode='42501';
  end if;
  return query select l.id, l.action, l.actor_id, l.target_user_id, l.details, l.created_at
    from public.raye2_group_moderation_log l
    where l.group_id = p_group_id
    order by l.created_at desc
    limit greatest(1, least(coalesce(p_limit,60), 200));
end;
$$;
revoke all on function public.raye2_list_group_moderation_log(uuid,integer) from public, anon;
grant execute on function public.raye2_list_group_moderation_log(uuid,integer) to authenticated;

notify pgrst, 'reload schema';
