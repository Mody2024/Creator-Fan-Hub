-- Raye2 Wave 5: topic channels inside large groups.
--
-- The community chat plan requires topic channels inside large groups so a busy group can split
-- conversation into named threads (plan line 317). Messages could already thread via
-- parent_message_id; this adds named group topics and scopes messages to a topic.

-- 1. Group topics. Managers create them; group members read them.
create table if not exists public.raye2_group_topics (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.raye2_groups(id) on delete cascade,
  slug text not null check (slug ~ '^[a-z0-9_-]{1,60}$'),
  name text not null check (char_length(btrim(name)) between 1 and 60),
  position integer not null default 0,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (group_id, slug)
);
create index if not exists raye2_group_topics_group_idx on public.raye2_group_topics(group_id, position);

alter table public.raye2_group_topics enable row level security;
revoke all on public.raye2_group_topics from anon, authenticated;
grant select on public.raye2_group_topics to authenticated;

drop policy if exists "Raye2 group members read topics" on public.raye2_group_topics;
create policy "Raye2 group members read topics"
on public.raye2_group_topics for select to authenticated
using (public.raye2_is_group_member(group_id) or public.raye2_is_group_manager(group_id));

-- 2. A message can be scoped to one topic.
alter table public.raye2_messages add column if not exists topic_id uuid;
alter table public.raye2_messages drop constraint if exists raye2_messages_topic_fk;
alter table public.raye2_messages add constraint raye2_messages_topic_fk
  foreign key (topic_id) references public.raye2_group_topics(id) on delete set null;
create index if not exists raye2_messages_topic_idx on public.raye2_messages(topic_id) where topic_id is not null;

-- A topic may only be attached to a message in the same group's conversation.
create or replace function public.raye2_guard_message_topic()
returns trigger language plpgsql security definer set search_path=''
as $$
declare v_group uuid;
begin
  if new.topic_id is null then return new; end if;
  select c.group_id into v_group from public.raye2_conversations c where c.id = new.conversation_id;
  if v_group is null or not exists (
    select 1 from public.raye2_group_topics t where t.id = new.topic_id and t.group_id = v_group
  ) then
    raise exception 'topic does not belong to this conversation' using errcode = '22023';
  end if;
  return new;
end;
$$;
revoke all on function public.raye2_guard_message_topic() from public, anon, authenticated;
drop trigger if exists raye2_messages_guard_topic on public.raye2_messages;
create trigger raye2_messages_guard_topic before insert or update on public.raye2_messages
for each row execute function public.raye2_guard_message_topic();

-- 3. Create a topic. Managers only. The slug is derived from the name and made unique per group.
create or replace function public.raye2_create_group_topic(p_group_id uuid, p_name text)
returns table (topic_id uuid, slug text)
language plpgsql security definer set search_path = ''
as $fn$
declare
  v_name text := btrim(coalesce(p_name, ''));
  v_base text;
  v_slug text;
  v_n integer := 1;
  v_id uuid;
begin
  if auth.uid() is null then raise exception 'sign in required' using errcode = '42501'; end if;
  if not public.raye2_is_group_manager(p_group_id) then
    raise exception 'group manager access required' using errcode = '42501';
  end if;
  if char_length(v_name) not between 1 and 60 then
    raise exception 'invalid topic name' using errcode = '22023';
  end if;
  v_base := trim(both '-' from lower(regexp_replace(v_name, '[^a-zA-Z0-9]+', '-', 'g')));
  if v_base = '' then v_base := 'topic'; end if;
  v_base := left(v_base, 50);
  v_slug := v_base;
  while exists (select 1 from public.raye2_group_topics gt where gt.group_id = p_group_id and gt.slug = v_slug) loop
    v_n := v_n + 1;
    v_slug := v_base || '-' || v_n::text;
  end loop;
  insert into public.raye2_group_topics(group_id, slug, name, position, created_by)
  values (p_group_id, v_slug, v_name, coalesce((select max(position) + 1 from public.raye2_group_topics where group_id = p_group_id), 0), auth.uid())
  returning id into v_id;
  return query select v_id, v_slug;
end;
$fn$;
revoke all on function public.raye2_create_group_topic(uuid,text) from public, anon;
grant execute on function public.raye2_create_group_topic(uuid,text) to authenticated;

-- 4. Delete a topic. Managers only; messages keep their history (topic_id becomes null).
create or replace function public.raye2_delete_group_topic(p_topic_id uuid)
returns void language plpgsql security definer set search_path = ''
as $fn$
declare v_group uuid;
begin
  if auth.uid() is null then raise exception 'sign in required' using errcode = '42501'; end if;
  select group_id into v_group from public.raye2_group_topics where id = p_topic_id;
  if v_group is null then raise exception 'topic not found' using errcode = 'P0002'; end if;
  if not public.raye2_is_group_manager(v_group) then
    raise exception 'group manager access required' using errcode = '42501';
  end if;
  delete from public.raye2_group_topics where id = p_topic_id;
end;
$fn$;
revoke all on function public.raye2_delete_group_topic(uuid) from public, anon;
grant execute on function public.raye2_delete_group_topic(uuid) to authenticated;

-- 5. List a group's topics with message counts. Group members only.
create or replace function public.raye2_list_group_topics(p_group_id uuid)
returns table (id uuid, slug text, name text, topic_position integer, message_count bigint)
language plpgsql stable security definer set search_path = ''
as $fn$
begin
  if auth.uid() is null or not (public.raye2_is_group_member(p_group_id) or public.raye2_is_group_manager(p_group_id)) then
    raise exception 'group membership required' using errcode = '42501';
  end if;
  return query
    select t.id, t.slug, t.name, t.position as topic_position,
      (select count(*) from public.raye2_messages m
        where m.topic_id = t.id and m.deleted_at is null
          and (m.expires_at is null or m.expires_at > now()))::bigint as message_count
    from public.raye2_group_topics t
    where t.group_id = p_group_id
    order by t.position asc, t.created_at asc;
end;
$fn$;
revoke all on function public.raye2_list_group_topics(uuid) from public, anon;
grant execute on function public.raye2_list_group_topics(uuid) to authenticated;

notify pgrst, 'reload schema';
