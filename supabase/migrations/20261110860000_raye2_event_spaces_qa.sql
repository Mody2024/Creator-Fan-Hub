-- Raye2 Wave 5: event Q&A and attached community spaces (plan 13.8).
--
-- Plan 13.8 requires community events to support Q&A and optional attached chat/voice/Watch Together spaces.
-- Events had RSVP, reminders, hosts and types, but no way for fans to ask questions and no link to a room.
--
-- Design:
--   * Questions live in event_qa; answers are written only by an event host or an authorized creator.
--   * The attached space is the event's existing group conversation, so chat/voice/Watch Together reuse the
--     community chat foundations instead of inventing a second room model. Attaching is host/creator-only and
--     requires the actor to actually belong to that conversation.
--   * All mutations are guarded SECURITY DEFINER RPCs pinned to an empty search_path.

-- 1. Attached space + question table.
alter table public.events
  add column if not exists conversation_id uuid references public.raye2_conversations(id) on delete set null;

create table if not exists public.event_qa (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  author_id uuid not null references auth.users(id) on delete cascade,
  body text not null check (char_length(btrim(body)) between 1 and 1000),
  answer_body text check (answer_body is null or char_length(btrim(answer_body)) between 1 and 2000),
  answered_by uuid references auth.users(id) on delete set null,
  answered_at timestamptz,
  status text not null default 'published' check (status in ('published','removed')),
  created_at timestamptz not null default now()
);
create index if not exists event_qa_event_idx on public.event_qa(event_id, created_at desc);
alter table public.event_qa enable row level security;
revoke all on public.event_qa from anon, authenticated;

-- 2. Helpers.
create or replace function public.raye2_can_answer_event(p_event_id uuid)
returns boolean language sql stable security definer set search_path=''
as $$
  select public.can_edit_creator_content()
    or exists (select 1 from public.event_hosts h where h.event_id=p_event_id and h.user_id=(select auth.uid()));
$$;
revoke all on function public.raye2_can_answer_event(uuid) from public, anon;
grant execute on function public.raye2_can_answer_event(uuid) to authenticated;

-- 3. Ask a question about a published event.
create or replace function public.raye2_ask_event_question(p_event_id uuid, p_body text)
returns table (question_id uuid, result_code text)
language plpgsql security definer set search_path=''
as $fn$
declare
  v_user uuid := (select auth.uid());
  v_status text;
  v_id uuid;
begin
  if v_user is null then raise exception 'authentication required' using errcode='42501'; end if;
  if p_body is null or char_length(btrim(p_body)) not between 1 and 1000 then
    raise exception 'a question between 1 and 1000 characters is required' using errcode='22023';
  end if;
  select status into v_status from public.events where id=p_event_id;
  if v_status is null then raise exception 'event not found' using errcode='22023'; end if;
  if v_status not in ('published','completed') then
    raise exception 'questions are not open for this event' using errcode='22023';
  end if;
  insert into public.event_qa(event_id, author_id, body)
  values (p_event_id, v_user, btrim(p_body))
  returning id into v_id;
  return query select v_id, 'asked'::text;
end;
$fn$;
revoke all on function public.raye2_ask_event_question(uuid,text) from public, anon;
grant execute on function public.raye2_ask_event_question(uuid,text) to authenticated;

-- 4. Answer a question (host or authorized creator only).
create or replace function public.raye2_answer_event_question(p_question_id uuid, p_body text)
returns table (answered boolean, result_code text)
language plpgsql security definer set search_path=''
as $fn$
declare
  v_user uuid := (select auth.uid());
  v_event uuid;
  v_status text;
begin
  if v_user is null then raise exception 'authentication required' using errcode='42501'; end if;
  if p_body is null or char_length(btrim(p_body)) not between 1 and 2000 then
    raise exception 'an answer between 1 and 2000 characters is required' using errcode='22023';
  end if;
  select q.event_id, q.status into v_event, v_status from public.event_qa q where q.id=p_question_id;
  if v_event is null then return query select false, 'not_found'::text; return; end if;
  if v_status <> 'published' then return query select false, 'removed'::text; return; end if;
  if not public.raye2_can_answer_event(v_event) then
    raise exception 'host or creator access required' using errcode='42501';
  end if;
  update public.event_qa set answer_body=btrim(p_body), answered_by=v_user, answered_at=now()
   where id=p_question_id;
  return query select true, 'answered'::text;
end;
$fn$;
revoke all on function public.raye2_answer_event_question(uuid,text) from public, anon;
grant execute on function public.raye2_answer_event_question(uuid,text) to authenticated;

-- 5. Remove a question (its author, a host or an authorized creator).
create or replace function public.raye2_remove_event_question(p_question_id uuid)
returns table (removed boolean, result_code text)
language plpgsql security definer set search_path=''
as $fn$
declare
  v_user uuid := (select auth.uid());
  v_event uuid;
  v_author uuid;
begin
  if v_user is null then raise exception 'authentication required' using errcode='42501'; end if;
  select q.event_id, q.author_id into v_event, v_author from public.event_qa q where q.id=p_question_id;
  if v_event is null then return query select false, 'not_found'::text; return; end if;
  if v_user <> v_author and not public.raye2_can_answer_event(v_event) then
    raise exception 'not allowed to remove this question' using errcode='42501';
  end if;
  update public.event_qa set status='removed' where id=p_question_id;
  return query select true, 'removed'::text;
end;
$fn$;
revoke all on function public.raye2_remove_event_question(uuid) from public, anon;
grant execute on function public.raye2_remove_event_question(uuid) to authenticated;

-- 6. Public Q&A read: published questions with author identity and the host answer.
create or replace function public.raye2_list_event_questions(p_event_id uuid, p_limit integer default 50)
returns table (
  id uuid, body text, created_at timestamptz,
  author_handle text, author_display_name text, author_avatar_url text,
  answer_body text, answered_at timestamptz, answered_by_handle text, answered_by_display_name text
)
language sql stable security definer set search_path=''
as $$
  with bounded as (select least(greatest(coalesce(p_limit,50),1),100) as lim)
  select q.id, q.body, q.created_at,
         ap.handle, ap.display_name, ap.avatar_url,
         q.answer_body, q.answered_at, hp.handle, hp.display_name
  from public.event_qa q
  join public.events e on e.id=q.event_id
  left join public.member_profiles ap on ap.user_id=q.author_id
  left join public.member_profiles hp on hp.user_id=q.answered_by
  where q.event_id=p_event_id and q.status='published'
    and e.status in ('published','completed')
    and not public.is_member_blocked(q.author_id)
  order by q.created_at desc
  limit (select lim from bounded);
$$;
revoke all on function public.raye2_list_event_questions(uuid,integer) from public;
grant execute on function public.raye2_list_event_questions(uuid,integer) to anon, authenticated;

-- 7. Attach or detach the event's community space (host or authorized creator, and only a room they belong to).
create or replace function public.raye2_attach_event_space(p_event_id uuid, p_conversation_id uuid)
returns table (attached boolean, result_code text)
language plpgsql security definer set search_path=''
as $fn$
begin
  if (select auth.uid()) is null then raise exception 'authentication required' using errcode='42501'; end if;
  if not exists (select 1 from public.events e where e.id=p_event_id) then
    return query select false, 'not_found'::text; return;
  end if;
  if not public.raye2_can_answer_event(p_event_id) then
    raise exception 'host or creator access required' using errcode='42501';
  end if;
  if p_conversation_id is not null then
    if not exists (select 1 from public.raye2_conversations c where c.id=p_conversation_id) then
      return query select false, 'room_not_found'::text; return;
    end if;
    if not public.raye2_is_conversation_member(p_conversation_id) then
      raise exception 'you must belong to the room you attach' using errcode='42501';
    end if;
  end if;
  update public.events set conversation_id=p_conversation_id where id=p_event_id;
  return query select true, case when p_conversation_id is null then 'detached' else 'attached' end;
end;
$fn$;
revoke all on function public.raye2_attach_event_space(uuid,uuid) from public, anon;
grant execute on function public.raye2_attach_event_space(uuid,uuid) to authenticated;

-- 8. Extend the public events read with the attached-space group slug (drop first: return shape changes).
drop function if exists public.raye2_get_public_events(integer);
create or replace function public.raye2_get_public_events(p_limit integer default 24)
returns table (
  id uuid, title text, description text, starts_at timestamptz, ends_at timestamptz, status text,
  event_type text, going_count integer, host_count integer, my_rsvp boolean, my_rsvp_status text,
  space_group_slug text
)
language plpgsql security definer set search_path = ''
as $fn$
#variable_conflict use_column
declare
  v_limit integer := least(greatest(coalesce(p_limit, 24), 1), 60);
  v_me uuid := (select auth.uid());
begin
  return query
    select e.id, e.title, e.description, e.starts_at, e.ends_at, e.status, e.event_type,
      coalesce(r.going_count, 0)::integer as going_count,
      coalesce(h.host_count, 0)::integer as host_count,
      coalesce(r.mine_going, false) as my_rsvp,
      case when r.mine_going then 'going' when r.mine_interested then 'interested' else null end as my_rsvp_status,
      g.slug as space_group_slug
    from public.events e
    left join (
      select event_id,
        count(*) filter (where status = 'going') as going_count,
        bool_or(user_id = v_me and status = 'going') as mine_going,
        bool_or(user_id = v_me and status = 'interested') as mine_interested
      from public.event_rsvps
      group by event_id
    ) r on r.event_id = e.id
    left join (
      select event_id, count(*) as host_count from public.event_hosts group by event_id
    ) h on h.event_id = e.id
    left join public.raye2_conversations c on c.id = e.conversation_id
    left join public.raye2_groups g on g.id = c.group_id
    where e.status in ('published', 'completed')
    order by (e.starts_at is null), e.starts_at asc, e.created_at desc
    limit v_limit;
end;
$fn$;
revoke all on function public.raye2_get_public_events(integer) from public;
grant execute on function public.raye2_get_public_events(integer) to anon, authenticated;

-- 9. Event questions are reportable like other community content.
alter table public.content_reports drop constraint if exists content_reports_target_type_check;
alter table public.content_reports add constraint content_reports_target_type_check
  check (target_type in ('post','comment','profile','community_clip','event_question'));

notify pgrst, 'reload schema';
