-- Raye2 Wave 7 / plan 13.2: creators can attach a community space to an event.
--
-- Plan 13.2 requires "Scheduled events with ... optional attached chat/voice/Watch Together rooms". The
-- attach RPC (raye2_attach_event_space) already existed, but nothing in the creator workspace could call it:
-- get_creator_events did not expose the attached space and there was no list of rooms a creator may attach, so
-- the public "Open space" link could never be set.

-- 1. Rooms the calling creator may attach: active groups they belong to.
create or replace function public.raye2_creator_attachable_spaces()
returns table (conversation_id uuid, group_name text, group_slug text)
language sql stable security definer set search_path=''
as $$
  select c.id, g.name, g.slug
  from public.raye2_conversations c
  join public.raye2_groups g on g.id = c.group_id
  join public.raye2_conversation_members m on m.conversation_id = c.id
  where m.user_id = (select auth.uid())
    and c.status = 'active' and g.status = 'active'
    and public.is_active_creator()
  order by g.name;
$$;
revoke all on function public.raye2_creator_attachable_spaces() from public,anon;
grant execute on function public.raye2_creator_attachable_spaces() to authenticated;

-- 2. Expose the attached space on the creator event list (drop first: the return shape changes).
drop function if exists public.get_creator_events(integer);
create or replace function public.get_creator_events(p_limit integer default 50)
returns table(event_id uuid,title text,description text,starts_at timestamptz,ends_at timestamptz,status text,created_at timestamptz,event_type text,reminder_minutes_before integer,space_group_slug text)
language plpgsql stable security definer set search_path=''
as $$
begin
 if auth.uid() is null or not public.is_active_creator() then raise exception 'creator access required' using errcode='42501'; end if;
 return query
   select e.id,e.title,e.description,e.starts_at,e.ends_at,e.status,e.created_at,e.event_type,e.reminder_minutes_before,g.slug
   from public.events e
   left join public.raye2_conversations c on c.id = e.conversation_id
   left join public.raye2_groups g on g.id = c.group_id
   order by e.starts_at desc nulls last,e.created_at desc
   limit least(greatest(coalesce(p_limit,50),1),100);
end; $$;
revoke all on function public.get_creator_events(integer) from public,anon;
grant execute on function public.get_creator_events(integer) to authenticated;

notify pgrst, 'reload schema';
