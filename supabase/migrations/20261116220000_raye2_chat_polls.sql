-- Raye2 Wave 6: polls inside direct and group chats (companion plan section 3: "Replies, reactions, polls,
-- shared files and shared content collections"). The platform already had site-wide polls, but a conversation
-- had no way to attach a poll to a message. Additive: a poll is a message whose attachment kind is 'poll'.
--
-- Design:
--   * A poll hangs off one message, so it inherits message retention, expiry, edit/delete and RLS.
--   * Only conversation members may read, create or vote; group polls require an active conversation.
--   * The poll author or a group manager may close it. Closing freezes voting but keeps results visible.
--   * Reads, writes and tallies go through security-definer RPCs; the tables are member-readable only.

create table if not exists public.raye2_message_polls (
  message_id uuid primary key references public.raye2_messages(id) on delete cascade,
  conversation_id uuid not null references public.raye2_conversations(id) on delete cascade,
  question text not null check (char_length(btrim(question)) between 1 and 160),
  allow_multiple boolean not null default false,
  closed_at timestamptz,
  created_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
create index if not exists raye2_message_polls_conversation_idx
  on public.raye2_message_polls(conversation_id,created_at desc);

create table if not exists public.raye2_message_poll_options (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null references public.raye2_message_polls(message_id) on delete cascade,
  label text not null check (char_length(btrim(label)) between 1 and 80),
  position integer not null check (position between 0 and 9),
  unique (message_id,position)
);
create index if not exists raye2_message_poll_options_message_idx
  on public.raye2_message_poll_options(message_id,position);

create table if not exists public.raye2_message_poll_votes (
  message_id uuid not null references public.raye2_message_polls(message_id) on delete cascade,
  option_id uuid not null references public.raye2_message_poll_options(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (message_id,user_id,option_id)
);
create index if not exists raye2_message_poll_votes_option_idx
  on public.raye2_message_poll_votes(message_id,option_id);

alter table public.raye2_message_polls enable row level security;
alter table public.raye2_message_poll_options enable row level security;
alter table public.raye2_message_poll_votes enable row level security;
revoke all on public.raye2_message_polls, public.raye2_message_poll_options, public.raye2_message_poll_votes from anon, authenticated;
grant select on public.raye2_message_polls, public.raye2_message_poll_options, public.raye2_message_poll_votes to authenticated;

drop policy if exists "Raye2 members read conversation polls" on public.raye2_message_polls;
create policy "Raye2 members read conversation polls" on public.raye2_message_polls for select to authenticated
using (public.raye2_is_conversation_member(conversation_id));
drop policy if exists "Raye2 members read poll options" on public.raye2_message_poll_options;
create policy "Raye2 members read poll options" on public.raye2_message_poll_options for select to authenticated
using (exists(select 1 from public.raye2_message_polls p where p.message_id=message_id and public.raye2_is_conversation_member(p.conversation_id)));
drop policy if exists "Raye2 members read poll votes" on public.raye2_message_poll_votes;
create policy "Raye2 members read poll votes" on public.raye2_message_poll_votes for select to authenticated
using (exists(select 1 from public.raye2_message_polls p where p.message_id=message_id and public.raye2_is_conversation_member(p.conversation_id)));

-- Create a poll as a message attachment. Returns the new message id.
create or replace function public.raye2_create_message_poll(
  p_conversation_id uuid, p_question text, p_options text[], p_allow_multiple boolean default false)
returns uuid language plpgsql security definer set search_path=''
as $$
declare
  v_me uuid := auth.uid();
  v_message_id uuid;
  v_option text;
  v_clean text[] := '{}';
  v_seen text[] := '{}';
begin
  if v_me is null or not public.raye2_is_conversation_member(p_conversation_id) then
    raise exception 'conversation unavailable' using errcode='42501';
  end if;
  if not exists(select 1 from public.raye2_conversations c where c.id=p_conversation_id and c.status='active'
    and (c.group_id is null or exists(select 1 from public.raye2_groups g where g.id=c.group_id and g.status='active'))) then
    raise exception 'conversation unavailable' using errcode='42501';
  end if;
  if p_question is null or char_length(btrim(p_question)) < 1 or char_length(btrim(p_question)) > 160 then
    raise exception 'poll question must be 1 to 160 characters' using errcode='22023';
  end if;
  if p_options is null or array_length(p_options,1) is null or array_length(p_options,1) < 2 or array_length(p_options,1) > 10 then
    raise exception 'a poll needs between 2 and 10 options' using errcode='22023';
  end if;
  foreach v_option in array p_options loop
    if v_option is null or char_length(btrim(v_option)) < 1 or char_length(btrim(v_option)) > 80 then
      raise exception 'each poll option must be 1 to 80 characters' using errcode='22023';
    end if;
    if btrim(v_option) = any(v_seen) then
      raise exception 'poll options must be unique' using errcode='22023';
    end if;
    v_seen := v_seen || btrim(v_option);
    v_clean := v_clean || btrim(v_option);
  end loop;
  perform public.raye2_rate_limit('chat.poll','rate.chat.message.hourly',300,3600);

  insert into public.raye2_messages(conversation_id,sender_id,body,attachment)
  values(p_conversation_id,v_me,'',jsonb_build_object('kind','poll'))
  returning id into v_message_id;

  insert into public.raye2_message_polls(message_id,conversation_id,question,allow_multiple,created_by)
  values(v_message_id,p_conversation_id,btrim(p_question),coalesce(p_allow_multiple,false),v_me);

  insert into public.raye2_message_poll_options(message_id,label,position)
  select v_message_id, opt, (ordinality - 1) from unnest(v_clean) with ordinality as t(opt, ordinality);

  update public.raye2_conversations set updated_at=now() where id=p_conversation_id;
  return v_message_id;
end;
$$;
revoke all on function public.raye2_create_message_poll(uuid,text,text[],boolean) from public, anon;
grant execute on function public.raye2_create_message_poll(uuid,text,text[],boolean) to authenticated;

-- Cast or replace a member's votes. Single-choice polls accept exactly one option.
create or replace function public.raye2_vote_message_poll(p_message_id uuid, p_option_ids uuid[])
returns void language plpgsql security definer set search_path=''
as $$
declare v_poll public.raye2_message_polls%rowtype; v_count integer;
begin
  if auth.uid() is null then raise exception 'sign in required' using errcode='42501'; end if;
  select * into v_poll from public.raye2_message_polls where message_id=p_message_id;
  if not found or not public.raye2_is_conversation_member(v_poll.conversation_id) then
    raise exception 'poll unavailable' using errcode='42501';
  end if;
  if v_poll.closed_at is not null then
    raise exception 'poll is closed' using errcode='55006';
  end if;
  if not exists(select 1 from public.raye2_messages m where m.id=p_message_id and m.deleted_at is null
    and (m.expires_at is null or m.expires_at>now())) then
    raise exception 'poll unavailable' using errcode='P0002';
  end if;
  if p_option_ids is null or array_length(p_option_ids,1) is null or array_length(p_option_ids,1) < 1 then
    raise exception 'select at least one option' using errcode='22023';
  end if;
  if not v_poll.allow_multiple and array_length(p_option_ids,1) <> 1 then
    raise exception 'this poll accepts a single choice' using errcode='22023';
  end if;
  select count(*) into v_count from public.raye2_message_poll_options o
    where o.message_id=p_message_id and o.id = any(p_option_ids);
  if v_count <> array_length(p_option_ids,1) then
    raise exception 'unknown poll option' using errcode='22023';
  end if;
  delete from public.raye2_message_poll_votes where message_id=p_message_id and user_id=auth.uid();
  insert into public.raye2_message_poll_votes(message_id,option_id,user_id)
  select p_message_id, opt, auth.uid() from unnest(p_option_ids) as opt;
end;
$$;
revoke all on function public.raye2_vote_message_poll(uuid,uuid[]) from public, anon;
grant execute on function public.raye2_vote_message_poll(uuid,uuid[]) to authenticated;

-- Close a poll. The poll author or a group manager may close it.
create or replace function public.raye2_close_message_poll(p_message_id uuid)
returns void language plpgsql security definer set search_path=''
as $$
declare v_poll public.raye2_message_polls%rowtype; v_group_id uuid;
begin
  select * into v_poll from public.raye2_message_polls where message_id=p_message_id;
  if not found or auth.uid() is null or not public.raye2_is_conversation_member(v_poll.conversation_id) then
    raise exception 'poll unavailable' using errcode='42501';
  end if;
  select group_id into v_group_id from public.raye2_conversations where id=v_poll.conversation_id;
  if v_poll.created_by <> auth.uid() and (v_group_id is null or not public.raye2_is_group_manager(v_group_id)) then
    raise exception 'only the poll author or a group manager may close it' using errcode='42501';
  end if;
  update public.raye2_message_polls set closed_at=coalesce(closed_at,now()) where message_id=p_message_id;
end;
$$;
revoke all on function public.raye2_close_message_poll(uuid) from public, anon;
grant execute on function public.raye2_close_message_poll(uuid) to authenticated;

-- Read one poll with live tallies and the caller's own votes. Member-only.
create or replace function public.raye2_get_message_poll(p_message_id uuid)
returns jsonb language plpgsql security definer set search_path=''
as $$
declare v_poll public.raye2_message_polls%rowtype; v_result jsonb;
begin
  select * into v_poll from public.raye2_message_polls where message_id=p_message_id;
  if not found or auth.uid() is null or not public.raye2_is_conversation_member(v_poll.conversation_id) then
    raise exception 'poll unavailable' using errcode='42501';
  end if;
  select jsonb_build_object(
    'message_id', v_poll.message_id,
    'question', v_poll.question,
    'allow_multiple', v_poll.allow_multiple,
    'closed', v_poll.closed_at is not null,
    'created_by', v_poll.created_by,
    'total_votes', (select count(*) from public.raye2_message_poll_votes v where v.message_id=v_poll.message_id),
    'my_votes', coalesce((select jsonb_agg(v.option_id) from public.raye2_message_poll_votes v
      where v.message_id=v_poll.message_id and v.user_id=auth.uid()),'[]'::jsonb),
    'options', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', o.id, 'label', o.label, 'position', o.position,
        'votes', (select count(*) from public.raye2_message_poll_votes v where v.option_id=o.id))
        order by o.position)
      from public.raye2_message_poll_options o where o.message_id=v_poll.message_id),'[]'::jsonb)
  ) into v_result;
  return v_result;
end;
$$;
revoke all on function public.raye2_get_message_poll(uuid) from public, anon;
grant execute on function public.raye2_get_message_poll(uuid) to authenticated;

notify pgrst, 'reload schema';
