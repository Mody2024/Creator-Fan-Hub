-- Raye2 direct-message requests and account-level contact controls.
create table if not exists public.raye2_contact_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  allow_message_requests boolean not null default true,
  updated_at timestamptz not null default now()
);
create table if not exists public.raye2_message_requests (
  id uuid primary key default gen_random_uuid(),
  sender_id uuid not null references auth.users(id) on delete cascade,
  recipient_id uuid not null references auth.users(id) on delete cascade,
  initial_message text not null default '' check (char_length(initial_message)<=5000),
  status text not null default 'pending' check (status in ('pending','accepted','declined','cancelled')),
  created_at timestamptz not null default now(),
  reviewed_at timestamptz,
  conversation_id uuid references public.raye2_conversations(id) on delete set null,
  check(sender_id<>recipient_id)
);
create unique index if not exists raye2_message_requests_pending_pair
  on public.raye2_message_requests(sender_id,recipient_id) where status='pending';
create index if not exists raye2_message_requests_recipient_pending
  on public.raye2_message_requests(recipient_id,created_at desc) where status='pending';
alter table public.raye2_contact_preferences enable row level security;
alter table public.raye2_message_requests enable row level security;
revoke all on public.raye2_contact_preferences from anon,authenticated;
revoke all on public.raye2_message_requests from anon,authenticated;
grant select on public.raye2_contact_preferences to authenticated;
grant select on public.raye2_message_requests to authenticated;
create policy "Raye2 users read own contact preferences" on public.raye2_contact_preferences
  for select to authenticated using(user_id=(select auth.uid()));
create policy "Raye2 request parties read requests" on public.raye2_message_requests
  for select to authenticated using(sender_id=(select auth.uid()) or recipient_id=(select auth.uid()));

create or replace function public.raye2_set_contact_preferences(p_allow_message_requests boolean)
returns void language plpgsql security definer set search_path=''
as $$
begin
  if auth.uid() is null then raise exception 'sign in required' using errcode='42501'; end if;
  insert into public.raye2_contact_preferences(user_id,allow_message_requests)
  values(auth.uid(),p_allow_message_requests)
  on conflict(user_id) do update set allow_message_requests=excluded.allow_message_requests,updated_at=now();
end;
$$;
revoke all on function public.raye2_set_contact_preferences(boolean) from public,anon;
grant execute on function public.raye2_set_contact_preferences(boolean) to authenticated;

drop function if exists public.raye2_create_direct_conversation(uuid);
create or replace function public.raye2_create_direct_conversation(p_other_user uuid)
returns jsonb language plpgsql security definer set search_path=''
as $$
declare v_id uuid; v_request_id uuid; v_a text; v_b text; v_allow boolean;
begin
  if auth.uid() is null then raise exception 'sign in required' using errcode='42501'; end if;
  if p_other_user is null or p_other_user=auth.uid() then raise exception 'choose another account' using errcode='22023'; end if;
  if not exists(select 1 from auth.users where id=p_other_user) then raise exception 'account not found' using errcode='P0002'; end if;
  if exists(select 1 from public.member_blocks b where
    (b.blocker_id=auth.uid() and b.blocked_id=p_other_user) or
    (b.blocker_id=p_other_user and b.blocked_id=auth.uid())) then
    raise exception 'conversation is unavailable' using errcode='42501';
  end if;
  v_a=least(auth.uid()::text,p_other_user::text); v_b=greatest(auth.uid()::text,p_other_user::text);
  perform pg_advisory_xact_lock(hashtextextended(v_a||':'||v_b,0));
  select c.id into v_id from public.raye2_conversations c
    join public.raye2_conversation_members a on a.conversation_id=c.id and a.user_id=auth.uid()
    join public.raye2_conversation_members b on b.conversation_id=c.id and b.user_id=p_other_user
    where c.conversation_type='direct' and c.status='active'
      and (select count(*) from public.raye2_conversation_members x where x.conversation_id=c.id)=2
    limit 1;
  if v_id is not null then return jsonb_build_object('status','conversation','conversation_id',v_id); end if;
  select id into v_request_id from public.raye2_message_requests
    where sender_id=p_other_user and recipient_id=auth.uid() and status='pending' limit 1;
  if v_request_id is not null then return jsonb_build_object('status','incoming_request','request_id',v_request_id); end if;
  select allow_message_requests into v_allow from public.raye2_contact_preferences where user_id=p_other_user;
  if coalesce(v_allow,true)=false then raise exception 'account is not accepting new message requests' using errcode='42501'; end if;
  select id into v_request_id from public.raye2_message_requests
    where sender_id=auth.uid() and recipient_id=p_other_user and status='pending' limit 1;
  if v_request_id is null then
    insert into public.raye2_message_requests(sender_id,recipient_id)
    values(auth.uid(),p_other_user) returning id into v_request_id;
  end if;
  return jsonb_build_object('status','request_sent','request_id',v_request_id);
end;
$$;
revoke all on function public.raye2_create_direct_conversation(uuid) from public,anon;
grant execute on function public.raye2_create_direct_conversation(uuid) to authenticated;

create or replace function public.raye2_review_message_request(p_request_id uuid,p_decision text)
returns uuid language plpgsql security definer set search_path=''
as $$
declare v_request public.raye2_message_requests%rowtype; v_conversation uuid;
begin
  if auth.uid() is null then raise exception 'sign in required' using errcode='42501'; end if;
  if p_decision not in ('accepted','declined','cancelled') then raise exception 'invalid decision' using errcode='22023'; end if;
  select * into v_request from public.raye2_message_requests where id=p_request_id for update;
  if not found or v_request.status<>'pending' then raise exception 'request unavailable' using errcode='P0002'; end if;
  if p_decision='cancelled' then
    if v_request.sender_id<>auth.uid() then raise exception 'request sender required' using errcode='42501'; end if;
  else
    if v_request.recipient_id<>auth.uid() then raise exception 'request recipient required' using errcode='42501'; end if;
  end if;
  if p_decision='accepted' then
    if exists(select 1 from public.member_blocks b where
      (b.blocker_id=v_request.sender_id and b.blocked_id=v_request.recipient_id) or
      (b.blocker_id=v_request.recipient_id and b.blocked_id=v_request.sender_id)) then
      raise exception 'conversation is unavailable' using errcode='42501';
    end if;
    insert into public.raye2_conversations(conversation_type,created_by)
    values('direct',v_request.recipient_id) returning id into v_conversation;
    insert into public.raye2_conversation_members(conversation_id,user_id)
    values(v_conversation,v_request.sender_id),(v_conversation,v_request.recipient_id);
    if length(btrim(v_request.initial_message))>0 then
      insert into public.raye2_messages(conversation_id,sender_id,body)
      values(v_conversation,v_request.sender_id,v_request.initial_message);
    end if;
  end if;
  update public.raye2_message_requests set status=p_decision,reviewed_at=now(),conversation_id=v_conversation
    where id=p_request_id;
  return v_conversation;
end;
$$;
revoke all on function public.raye2_review_message_request(uuid,text) from public,anon;
grant execute on function public.raye2_review_message_request(uuid,text) to authenticated;
