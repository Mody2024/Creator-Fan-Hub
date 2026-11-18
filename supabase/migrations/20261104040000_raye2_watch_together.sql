-- Raye2 Watch Together: synchronized sessions, member presence, shared queue and votes.
insert into public.raye2_platform_rules(rule_key,category,rule_value,status,description) values
 ('watch.enabled','watch','false'::jsonb,'proposed','Owner-controlled availability for Watch Together sessions.'),
 ('watch.public_sessions.enabled','watch','false'::jsonb,'proposed','Owner-controlled public Watch Together sessions.'),
 ('watch.max_participants','watch','10'::jsonb,'proposed','Suggested initial Watch Together participant cap.'),
 ('watch.session.max_duration_seconds','watch','10800'::jsonb,'proposed','Maximum Watch Together session duration.'),
 ('watch.queue.max_items','watch','100'::jsonb,'proposed','Maximum queue items in one Watch Together session.')
on conflict (rule_key) do nothing;

create table if not exists public.raye2_watch_sessions (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.raye2_conversations(id) on delete cascade,
  group_id uuid references public.raye2_groups(id) on delete cascade,
  created_by uuid not null references auth.users(id) on delete restrict,
  title text not null default 'Watch Together' check (char_length(btrim(title)) between 1 and 100),
  visibility text not null default 'private' check (visibility in ('private','public')),
  status text not null default 'active' check (status in ('active','ended','expired')),
  current_queue_item_id uuid,
  current_position_seconds numeric(12,3) not null default 0 check (current_position_seconds>=0),
  is_playing boolean not null default false,
  playback_updated_at timestamptz not null default now(),
  playback_version bigint not null default 0,
  max_participants integer not null default 10 check (max_participants between 2 and 50),
  expires_at timestamptz not null default (now()+interval '3 hours'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists raye2_watch_sessions_discovery_idx
  on public.raye2_watch_sessions(visibility,status,created_at desc);
create index if not exists raye2_watch_sessions_conversation_idx
  on public.raye2_watch_sessions(conversation_id,status,created_at desc);

create table if not exists public.raye2_watch_queue (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.raye2_watch_sessions(id) on delete cascade,
  source_kind text not null check (source_kind in ('native','external')),
  source_media_id uuid references public.video_catalog(media_id) on delete restrict,
  external_url text,
  title text not null check (char_length(btrim(title)) between 1 and 160),
  added_by uuid not null references auth.users(id) on delete restrict,
  sort_order integer not null default 0,
  status text not null default 'queued' check (status in ('queued','playing','played','skipped')),
  created_at timestamptz not null default now(),
  unique(id,session_id),
  check (
    (source_kind='native' and source_media_id is not null and external_url is null)
    or (source_kind='external' and source_media_id is null and external_url is not null)
  )
);
create index if not exists raye2_watch_queue_order_idx
  on public.raye2_watch_queue(session_id,status,sort_order,created_at);
alter table public.raye2_watch_sessions
  add constraint raye2_watch_current_queue_fk
  foreign key(current_queue_item_id)
  references public.raye2_watch_queue(id)
  on delete set null;

create table if not exists public.raye2_watch_participants (
  session_id uuid not null references public.raye2_watch_sessions(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'participant' check (role in ('host','moderator','participant')),
  status text not null default 'invited' check (status in ('invited','joined','left','removed')),
  invited_at timestamptz not null default now(),
  joined_at timestamptz,
  last_seen_at timestamptz,
  primary key(session_id,user_id)
);
create index if not exists raye2_watch_participants_user_idx
  on public.raye2_watch_participants(user_id,status,invited_at desc);

create table if not exists public.raye2_watch_votes (
  session_id uuid not null references public.raye2_watch_sessions(id) on delete cascade,
  queue_item_id uuid not null references public.raye2_watch_queue(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key(queue_item_id,user_id)
);
create index if not exists raye2_watch_votes_session_idx
  on public.raye2_watch_votes(session_id,queue_item_id);

alter table public.raye2_watch_sessions enable row level security;
alter table public.raye2_watch_queue enable row level security;
alter table public.raye2_watch_participants enable row level security;
alter table public.raye2_watch_votes enable row level security;

revoke all on public.raye2_watch_sessions,public.raye2_watch_queue,
  public.raye2_watch_participants,public.raye2_watch_votes from anon,authenticated;
grant select on public.raye2_watch_sessions,public.raye2_watch_queue,
  public.raye2_watch_participants,public.raye2_watch_votes to authenticated;

create or replace function public.raye2_can_access_watch_session(p_session_id uuid)
returns boolean language sql stable security definer set search_path=''
as $$
  select (select auth.uid()) is not null and exists (
    select 1 from public.raye2_watch_sessions s
    where s.id=p_session_id and s.status='active' and s.expires_at>now()
      and (
        exists(select 1 from public.raye2_watch_participants p
          where p.session_id=s.id and p.user_id=(select auth.uid()) and p.status in ('invited','joined'))
        or public.raye2_is_conversation_member(s.conversation_id)
        or (s.group_id is not null and public.raye2_is_group_member(s.group_id))
        or (s.visibility='public' and s.group_id is not null and exists(
          select 1 from public.raye2_groups g where g.id=s.group_id
            and g.visibility='public' and g.status='active'))
      )
  );
$$;
revoke all on function public.raye2_can_access_watch_session(uuid) from public,anon;
grant execute on function public.raye2_can_access_watch_session(uuid) to authenticated;

create or replace function public.raye2_is_watch_participant(p_session_id uuid)
returns boolean language sql stable security definer set search_path=''
as $$
  select (select auth.uid()) is not null and exists (
    select 1 from public.raye2_watch_participants p
    join public.raye2_watch_sessions s on s.id=p.session_id
    where p.session_id=p_session_id and p.user_id=(select auth.uid()) and p.status='joined'
      and s.status='active' and s.expires_at>now()
  );
$$;
revoke all on function public.raye2_is_watch_participant(uuid) from public,anon;
grant execute on function public.raye2_is_watch_participant(uuid) to authenticated;

create policy "Raye2 watch sessions visible to session members or public-group viewers"
  on public.raye2_watch_sessions for select to authenticated
  using (public.raye2_can_access_watch_session(id));
create policy "Raye2 watch participants visible to session members"
  on public.raye2_watch_participants for select to authenticated
  using (public.raye2_can_access_watch_session(session_id));
create policy "Raye2 watch queue visible to session members"
  on public.raye2_watch_queue for select to authenticated
  using (public.raye2_can_access_watch_session(session_id));
create policy "Raye2 watch votes visible to session members"
  on public.raye2_watch_votes for select to authenticated
  using (public.raye2_can_access_watch_session(session_id));

create or replace function public.raye2_validate_watch_source(
  p_source_kind text,p_source_media_id uuid,p_external_url text
)
returns boolean language plpgsql stable security definer set search_path=''
as $$
begin
  if p_source_kind='native' then
    return p_source_media_id is not null and p_external_url is null and exists(
      select 1 from public.video_catalog v
      join public.media_items m on m.id=v.media_id
      where v.media_id=p_source_media_id and v.published_at is not null
        and m.is_published=true and m.media_type in ('video','youtube')
        and m.processing_status='ready'
    );
  elsif p_source_kind='external' then
    return p_source_media_id is null and p_external_url ~* '^https://(www\.)?(youtube[.]com/watch\?v=[A-Za-z0-9_-]{6,}|youtu[.]be/[A-Za-z0-9_-]{6,}|vimeo[.]com/[0-9]{5,})([?&][^ ]*)?$';
  end if;
  return false;
end;
$$;
revoke all on function public.raye2_validate_watch_source(text,uuid,text) from public,anon;
grant execute on function public.raye2_validate_watch_source(text,uuid,text) to authenticated;

create or replace function public.raye2_create_watch_session(
  p_conversation_id uuid,p_title text,p_visibility text,
  p_source_kind text,p_source_media_id uuid,p_external_url text,
  p_max_participants integer default null
)
returns uuid language plpgsql security definer set search_path=''
as $$
declare
  v_conversation public.raye2_conversations%rowtype;
  v_group public.raye2_groups%rowtype;
  v_session uuid;
  v_item uuid;
  v_enabled boolean:=false;
  v_public_enabled boolean:=false;
  v_max integer:=10;
  v_duration integer:=10800;
  v_title text:=coalesce(nullif(btrim(p_title),''),'Watch Together');
begin
  if auth.uid() is null then raise exception 'sign in required' using errcode='42501'; end if;
  if p_visibility not in ('private','public') or char_length(v_title)>100 then
    raise exception 'invalid watch session settings' using errcode='22023';
  end if;
  select * into v_conversation from public.raye2_conversations c
    where c.id=p_conversation_id and c.status='active';
  if not found or not public.raye2_is_conversation_member(p_conversation_id) then
    raise exception 'active conversation membership required' using errcode='42501';
  end if;
  if v_conversation.group_id is not null then
    select * into v_group from public.raye2_groups g
      where g.id=v_conversation.group_id and g.status='active';
    if not found then raise exception 'active group required' using errcode='42501'; end if;
  elsif p_visibility='public' then
    raise exception 'direct-conversation watch sessions must be private' using errcode='22023';
  end if;
  if p_visibility='public' and v_group.visibility<>'public' then
    raise exception 'public watch sessions require a public group' using errcode='42501';
  end if;
  select coalesce((r.rule_value #>> '{}')::boolean,false) into v_enabled
    from public.raye2_platform_rules r where r.rule_key='watch.enabled' and r.status='active';
  if not coalesce(v_enabled,false) then raise exception 'Watch Together is not enabled by the platform owner' using errcode='42501'; end if;
  if p_visibility='public' then
    select coalesce((r.rule_value #>> '{}')::boolean,false) into v_public_enabled
      from public.raye2_platform_rules r where r.rule_key='watch.public_sessions.enabled' and r.status='active';
    if not coalesce(v_public_enabled,false) then raise exception 'public watch sessions are disabled' using errcode='42501'; end if;
  end if;
  if not public.raye2_validate_watch_source(p_source_kind,p_source_media_id,p_external_url) then
    raise exception 'video source is not eligible for Watch Together' using errcode='22023';
  end if;
  select (r.rule_value #>> '{}')::integer into v_max from public.raye2_platform_rules r
    where r.rule_key='watch.max_participants' and r.status='active';
  select (r.rule_value #>> '{}')::integer into v_duration from public.raye2_platform_rules r
    where r.rule_key='watch.session.max_duration_seconds' and r.status='active';
  v_max:=greatest(2,least(coalesce(p_max_participants,v_max,10),coalesce(v_max,10),50));
  v_duration:=greatest(300,least(coalesce(v_duration,10800),43200));
  insert into public.raye2_watch_sessions(conversation_id,group_id,created_by,title,visibility,max_participants,expires_at)
    values(p_conversation_id,v_conversation.group_id,auth.uid(),v_title,p_visibility,v_max,now()+make_interval(secs=>v_duration))
    returning id into v_session;
  insert into public.raye2_watch_participants(session_id,user_id,role,status,joined_at,last_seen_at)
    values(v_session,auth.uid(),'host','joined',now(),now());
  insert into public.raye2_watch_queue(session_id,source_kind,source_media_id,external_url,title,added_by,sort_order,status)
    values(v_session,p_source_kind,p_source_media_id,p_external_url,v_title,auth.uid(),0,'playing')
    returning id into v_item;
  update public.raye2_watch_sessions set current_queue_item_id=v_item where id=v_session;
  return v_session;
end;
$$;
revoke all on function public.raye2_create_watch_session(uuid,text,text,text,uuid,text,integer) from public,anon;
grant execute on function public.raye2_create_watch_session(uuid,text,text,text,uuid,text,integer) to authenticated;

create or replace function public.raye2_join_watch_session(p_session_id uuid)
returns void language plpgsql security definer set search_path=''
as $$
declare
  v_session public.raye2_watch_sessions%rowtype;
  v_count integer;
  v_allowed boolean:=false;
begin
  if auth.uid() is null then raise exception 'sign in required' using errcode='42501'; end if;
  select * into v_session from public.raye2_watch_sessions s
    where s.id=p_session_id and s.status='active' and s.expires_at>now() for update;
  if not found then raise exception 'watch session unavailable' using errcode='P0002'; end if;
  if v_session.visibility='public' and v_session.group_id is not null then
    select exists(select 1 from public.raye2_groups g where g.id=v_session.group_id
      and g.visibility='public' and g.status='active') into v_allowed;
  end if;
  if not v_allowed then
    v_allowed:=public.raye2_is_conversation_member(v_session.conversation_id);
    if not v_allowed and v_session.group_id is not null then
      v_allowed:=public.raye2_is_group_member(v_session.group_id);
    end if;
    if not v_allowed and exists(select 1 from public.raye2_watch_participants p
      where p.session_id=p_session_id and p.user_id=auth.uid() and p.status='invited') then
      v_allowed:=true;
    end if;
  end if;
  if not v_allowed then raise exception 'watch session invitation or membership required' using errcode='42501'; end if;
  select count(*) into v_count from public.raye2_watch_participants p
    where p.session_id=p_session_id and p.status='joined' and p.user_id<>auth.uid();
  if v_count>=v_session.max_participants then raise exception 'watch session is full' using errcode='54000'; end if;
  insert into public.raye2_watch_participants(session_id,user_id,role,status,joined_at,last_seen_at)
    values(p_session_id,auth.uid(),'participant','joined',now(),now())
    on conflict(session_id,user_id) do update set status='joined',joined_at=now(),last_seen_at=now();
end;
$$;
revoke all on function public.raye2_join_watch_session(uuid) from public,anon;
grant execute on function public.raye2_join_watch_session(uuid) to authenticated;

create or replace function public.raye2_leave_watch_session(p_session_id uuid)
returns void language plpgsql security definer set search_path=''
as $$
declare v_role text;v_next uuid;v_remaining integer;
begin
  if auth.uid() is null then raise exception 'sign in required' using errcode='42501'; end if;
  select p.role into v_role from public.raye2_watch_participants p
    where p.session_id=p_session_id and p.user_id=auth.uid() and p.status='joined' for update;
  if not found then return; end if;
  update public.raye2_watch_participants set status='left',last_seen_at=now()
    where session_id=p_session_id and user_id=auth.uid();
  if v_role='host' then
    select p.user_id into v_next from public.raye2_watch_participants p
      where p.session_id=p_session_id and p.status='joined'
      order by case when p.role='moderator' then 0 else 1 end,p.joined_at limit 1;
    if v_next is null then
      update public.raye2_watch_sessions set status='ended',is_playing=false,updated_at=now() where id=p_session_id;
    else
      update public.raye2_watch_participants set role='host' where session_id=p_session_id and user_id=v_next;
    end if;
  end if;
end;
$$;
revoke all on function public.raye2_leave_watch_session(uuid) from public,anon;
grant execute on function public.raye2_leave_watch_session(uuid) to authenticated;

create or replace function public.raye2_update_watch_playback(
  p_session_id uuid,p_position_seconds numeric,p_is_playing boolean
)
returns bigint language plpgsql security definer set search_path=''
as $$
declare v_role text;v_version bigint;
begin
  if auth.uid() is null then raise exception 'sign in required' using errcode='42501'; end if;
  if p_position_seconds is null or p_position_seconds<0 or p_position_seconds>86400 then
    raise exception 'invalid playback position' using errcode='22023';
  end if;
  select p.role into v_role from public.raye2_watch_participants p
    join public.raye2_watch_sessions s on s.id=p.session_id
    where p.session_id=p_session_id and p.user_id=auth.uid() and p.status='joined'
      and s.status='active' and s.expires_at>now() for update of s;
  if v_role is null or v_role not in ('host','moderator') then
    raise exception 'watch host control permission required' using errcode='42501';
  end if;
  update public.raye2_watch_sessions set current_position_seconds=p_position_seconds,
    is_playing=coalesce(p_is_playing,false),playback_updated_at=now(),
    playback_version=playback_version+1,updated_at=now()
    where id=p_session_id returning playback_version into v_version;
  return v_version;
end;
$$;
revoke all on function public.raye2_update_watch_playback(uuid,numeric,boolean) from public,anon;
grant execute on function public.raye2_update_watch_playback(uuid,numeric,boolean) to authenticated;

create or replace function public.raye2_add_watch_queue_item(
  p_session_id uuid,p_source_kind text,p_source_media_id uuid,p_external_url text,p_title text
)
returns uuid language plpgsql security definer set search_path=''
as $$
declare v_item uuid;v_count integer;v_limit integer:=100;v_position integer;
begin
  if auth.uid() is null then raise exception 'sign in required' using errcode='42501'; end if;
  if not public.raye2_is_watch_participant(p_session_id) then
    raise exception 'joined watch session membership required' using errcode='42501';
  end if;
  if not public.raye2_validate_watch_source(p_source_kind,p_source_media_id,p_external_url) then
    raise exception 'video source is not eligible for Watch Together' using errcode='22023';
  end if;
  select (r.rule_value #>> '{}')::integer into v_limit from public.raye2_platform_rules r
    where r.rule_key='watch.queue.max_items' and r.status='active';
  select count(*),coalesce(max(q.sort_order),-1)+1 into v_count,v_position
    from public.raye2_watch_queue q where q.session_id=p_session_id and q.status in ('queued','playing');
  if v_count>=greatest(1,least(coalesce(v_limit,100),200)) then
    raise exception 'watch queue is full' using errcode='54000';
  end if;
  insert into public.raye2_watch_queue(session_id,source_kind,source_media_id,external_url,title,added_by,sort_order,status)
    values(p_session_id,p_source_kind,p_source_media_id,p_external_url,
      left(coalesce(nullif(btrim(p_title),''),'Untitled video'),160),auth.uid(),v_position,'queued')
    returning id into v_item;
  return v_item;
end;
$$;
revoke all on function public.raye2_add_watch_queue_item(uuid,text,uuid,text,text) from public,anon;
grant execute on function public.raye2_add_watch_queue_item(uuid,text,uuid,text,text) to authenticated;

create or replace function public.raye2_vote_watch_queue_item(p_session_id uuid,p_queue_item_id uuid)
returns void language plpgsql security definer set search_path=''
as $$
begin
  if auth.uid() is null then raise exception 'sign in required' using errcode='42501'; end if;
  if not public.raye2_is_watch_participant(p_session_id) then
    raise exception 'joined watch session membership required' using errcode='42501';
  end if;
  if not exists(select 1 from public.raye2_watch_queue q where q.id=p_queue_item_id
    and q.session_id=p_session_id and q.status='queued') then
    raise exception 'queued item unavailable' using errcode='P0002';
  end if;
  insert into public.raye2_watch_votes(session_id,queue_item_id,user_id)
    values(p_session_id,p_queue_item_id,auth.uid())
    on conflict(queue_item_id,user_id) do nothing;
end;
$$;
revoke all on function public.raye2_vote_watch_queue_item(uuid,uuid) from public,anon;
grant execute on function public.raye2_vote_watch_queue_item(uuid,uuid) to authenticated;

create or replace function public.raye2_advance_watch_queue(p_session_id uuid)
returns uuid language plpgsql security definer set search_path=''
as $$
declare v_role text;v_current uuid;v_next uuid;
begin
  if auth.uid() is null then raise exception 'sign in required' using errcode='42501'; end if;
  select p.role,s.current_queue_item_id into v_role,v_current
    from public.raye2_watch_participants p join public.raye2_watch_sessions s on s.id=p.session_id
    where p.session_id=p_session_id and p.user_id=auth.uid() and p.status='joined'
      and s.status='active' and s.expires_at>now() for update of s;
  if v_role is null or v_role not in ('host','moderator') then
    raise exception 'watch host control permission required' using errcode='42501';
  end if;
  if v_current is not null then
    update public.raye2_watch_queue set status='played' where id=v_current and session_id=p_session_id;
  end if;
  select q.id into v_next from public.raye2_watch_queue q
    left join (select queue_item_id,count(*) as votes from public.raye2_watch_votes
      where session_id=p_session_id group by queue_item_id) v on v.queue_item_id=q.id
    where q.session_id=p_session_id and q.status='queued'
    order by coalesce(v.votes,0) desc,q.sort_order,q.created_at limit 1;
  if v_next is not null then
    update public.raye2_watch_queue set status='playing' where id=v_next;
  end if;
  update public.raye2_watch_sessions set current_queue_item_id=v_next,
    current_position_seconds=0,is_playing=false,playback_updated_at=now(),
    playback_version=playback_version+1,updated_at=now()
    where id=p_session_id;
  return v_next;
end;
$$;
revoke all on function public.raye2_advance_watch_queue(uuid) from public,anon;
grant execute on function public.raye2_advance_watch_queue(uuid) to authenticated;

create or replace function public.raye2_reorder_watch_queue_item(
  p_session_id uuid,p_queue_item_id uuid,p_new_order integer
)
returns void language plpgsql security definer set search_path=''
as $$
declare v_role text;
begin
  if auth.uid() is null then raise exception 'sign in required' using errcode='42501'; end if;
  select p.role into v_role from public.raye2_watch_participants p
    join public.raye2_watch_sessions s on s.id=p.session_id
    where p.session_id=p_session_id and p.user_id=auth.uid() and p.status='joined'
      and s.status='active' and s.expires_at>now();
  if v_role is null or v_role not in ('host','moderator') then
    raise exception 'watch host control permission required' using errcode='42501';
  end if;
  if p_new_order<0 or p_new_order>200 then raise exception 'invalid queue position' using errcode='22023'; end if;
  update public.raye2_watch_queue set sort_order=p_new_order
    where id=p_queue_item_id and session_id=p_session_id and status='queued';
  if not found then raise exception 'queued item unavailable' using errcode='P0002'; end if;
end;
$$;
revoke all on function public.raye2_reorder_watch_queue_item(uuid,uuid,integer) from public,anon;
grant execute on function public.raye2_reorder_watch_queue_item(uuid,uuid,integer) to authenticated;

create or replace function public.raye2_remove_watch_queue_item(p_session_id uuid,p_queue_item_id uuid)
returns void language plpgsql security definer set search_path=''
as $$
declare v_role text;
begin
  if auth.uid() is null then raise exception 'sign in required' using errcode='42501'; end if;
  select p.role into v_role from public.raye2_watch_participants p
    join public.raye2_watch_sessions s on s.id=p.session_id
    where p.session_id=p_session_id and p.user_id=auth.uid() and p.status='joined'
      and s.status='active' and s.expires_at>now();
  if v_role is null or v_role not in ('host','moderator') then
    raise exception 'watch host control permission required' using errcode='42501';
  end if;
  update public.raye2_watch_queue set status='skipped'
    where id=p_queue_item_id and session_id=p_session_id and status in ('queued','playing');
  if not found then raise exception 'queue item unavailable' using errcode='P0002'; end if;
  update public.raye2_watch_sessions set current_queue_item_id=null,
    current_position_seconds=0,is_playing=false,playback_updated_at=now(),
    playback_version=playback_version+1,updated_at=now()
    where id=p_session_id and current_queue_item_id=p_queue_item_id;
end;
$$;
revoke all on function public.raye2_remove_watch_queue_item(uuid,uuid) from public,anon;
grant execute on function public.raye2_remove_watch_queue_item(uuid,uuid) to authenticated;

-- Session and queue updates are delivered to joined room members via Postgres Changes.
do $$
declare v_table text;
begin
  if exists (select 1 from pg_publication where pubname='supabase_realtime' and not puballtables) then
    foreach v_table in array array[
      'raye2_watch_sessions','raye2_watch_participants','raye2_watch_queue','raye2_watch_votes'
    ] loop
      if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime'
        and schemaname='public' and tablename=v_table) then
        execute format('alter publication supabase_realtime add table public.%I',v_table);
      end if;
    end loop;
  end if;
end;
$$;

create policy "Raye2 watch participants can receive private room broadcasts"
  on realtime.messages for select to authenticated
  using (
    extension in ('broadcast','presence')
    and public.raye2_can_access_watch_session(
      case when realtime.topic() ~ '^raye2:watch:[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
        then substring(realtime.topic() from 13)::uuid else null end
    )
  );
create policy "Raye2 joined watch participants can send room broadcasts"
  on realtime.messages for insert to authenticated
  with check (
    extension in ('broadcast','presence')
    and public.raye2_is_watch_participant(
      case when realtime.topic() ~ '^raye2:watch:[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
        then substring(realtime.topic() from 13)::uuid else null end
    )
  );

revoke all on function public.raye2_validate_watch_source(text,uuid,text) from public,anon;
revoke all on function public.raye2_can_access_watch_session(uuid) from public,anon;
revoke all on function public.raye2_is_watch_participant(uuid) from public,anon;
