-- Behavioral RLS and RPC authorization matrix.
--
-- Runs after every migration has applied (see scripts/raye2-migration-check.mjs). It seeds a small,
-- deterministic dataset and then exercises the real guard logic by switching the session role and the
-- Supabase request-context GUCs, exactly as PostgREST does per request. Every check either proves an
-- authorized action succeeds and persists, or proves a denied action raises the expected SQLSTATE.
-- Any mismatch raises and fails the check (psql runs with ON_ERROR_STOP=1).
--
-- Only public RPCs are called, and every object touched is created by these migrations, so a failure
-- means the migrated schema does not enforce what the source claims.

-- Deterministic actors and objects reused across every block.
--   owner   1111…  group owner (also poll author)
--   admin   2222…  group admin
--   outsider 3333… member of the group but not a manager; not in the group conversation
--   group   aaaa…  public active group with a group conversation cccc…

-- ---------------------------------------------------------------------------
-- Seed (runs as the superuser session; deterministic ids make this idempotent).
-- ---------------------------------------------------------------------------
do $$
begin
  delete from public.raye2_groups where id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

  insert into auth.users(id,email) values
    ('11111111-1111-1111-1111-111111111111','matrix-owner@raye2.test'),
    ('22222222-2222-2222-2222-222222222222','matrix-admin@raye2.test'),
    ('33333333-3333-3333-3333-333333333333','matrix-outsider@raye2.test')
  on conflict (id) do nothing;

  insert into public.member_profiles(user_id,handle,display_name) values
    ('11111111-1111-1111-1111-111111111111','raye2matrixowner','Matrix Owner'),
    ('22222222-2222-2222-2222-222222222222','raye2matrixadmin','Matrix Admin'),
    ('33333333-3333-3333-3333-333333333333','raye2matrixoutsider','Matrix Outsider')
  on conflict (user_id) do nothing;

  insert into public.raye2_groups(id,name,slug,owner_id,visibility,status)
  values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','Matrix Group','raye2-matrix-group',
          '11111111-1111-1111-1111-111111111111','public','active');

  insert into public.raye2_group_members(group_id,user_id,role,status) values
    ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','11111111-1111-1111-1111-111111111111','owner','active'),
    ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','22222222-2222-2222-2222-222222222222','admin','active'),
    ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','33333333-3333-3333-3333-333333333333','member','active');

  insert into public.raye2_conversations(id,conversation_type,group_id,created_by,status)
  values ('cccccccc-cccc-cccc-cccc-cccccccccccc','group','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
          '11111111-1111-1111-1111-111111111111','active');

  insert into public.raye2_conversation_members(conversation_id,user_id) values
    ('cccccccc-cccc-cccc-cccc-cccccccccccc','11111111-1111-1111-1111-111111111111'),
    ('cccccccc-cccc-cccc-cccc-cccccccccccc','22222222-2222-2222-2222-222222222222');
end $$;

-- ---------------------------------------------------------------------------
-- Group profile editing (Batch 11): manager-only, validated, and persisted.
-- ---------------------------------------------------------------------------
do $$
declare
  v_group uuid := 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  v_owner uuid := '11111111-1111-1111-1111-111111111111';
  v_admin uuid := '22222222-2222-2222-2222-222222222222';
  v_outsider uuid := '33333333-3333-3333-3333-333333333333';
begin
  -- Outsider (member, not manager) is denied.
  begin
    set local role authenticated;
    perform set_config('request.jwt.claim.role','authenticated',true);
    perform set_config('request.jwt.claim.sub', v_outsider::text, true);
    begin
      perform public.raye2_update_group_profile(v_group,'outsider edit');
      raise exception 'MATRIX FAIL: a non-manager edited the group profile';
    exception when sqlstate '42501' then null;
    end;
    reset role;
  exception when others then reset role; raise;
  end;

  -- Owner succeeds and the change persists.
  begin
    set local role authenticated;
    perform set_config('request.jwt.claim.role','authenticated',true);
    perform set_config('request.jwt.claim.sub', v_owner::text, true);
    perform public.raye2_update_group_profile(v_group,'Owner description','https://cdn.raye2.test/g.png','Be kind');
    reset role;
  exception when others then reset role; raise;
  end;
  if (select description from public.raye2_groups where id=v_group) <> 'Owner description' then
    raise exception 'MATRIX FAIL: the owner profile edit did not persist';
  end if;

  -- Admin succeeds too (admin is a manager).
  begin
    set local role authenticated;
    perform set_config('request.jwt.claim.role','authenticated',true);
    perform set_config('request.jwt.claim.sub', v_admin::text, true);
    perform public.raye2_update_group_profile(v_group, p_rules => 'Updated rules');
    reset role;
  exception when others then reset role; raise;
  end;
  if (select rules from public.raye2_groups where id=v_group) <> 'Updated rules' then
    raise exception 'MATRIX FAIL: the admin profile edit did not persist';
  end if;

  -- Over-length description is rejected even for a manager.
  begin
    set local role authenticated;
    perform set_config('request.jwt.claim.role','authenticated',true);
    perform set_config('request.jwt.claim.sub', v_owner::text, true);
    begin
      perform public.raye2_update_group_profile(v_group, repeat('x',1001));
      raise exception 'MATRIX FAIL: an over-length description was accepted';
    exception when sqlstate '22023' then null;
    end;
    reset role;
  exception when others then reset role; raise;
  end;

  -- A non-https image is rejected.
  begin
    set local role authenticated;
    perform set_config('request.jwt.claim.role','authenticated',true);
    perform set_config('request.jwt.claim.sub', v_owner::text, true);
    begin
      perform public.raye2_update_group_profile(v_group, p_image_url => 'http://insecure.test/x.png');
      raise exception 'MATRIX FAIL: a non-https image URL was accepted';
    exception when sqlstate '22023' then null;
    end;
    reset role;
  exception when others then reset role; raise;
  end;

  -- Anonymous callers cannot execute the RPC at all.
  begin
    set local role anon;
    perform set_config('request.jwt.claim.role','anon',true);
    perform set_config('request.jwt.claim.sub','',true);
    begin
      perform public.raye2_update_group_profile(v_group,'anon edit');
      raise exception 'MATRIX FAIL: anon could execute the profile RPC';
    exception when insufficient_privilege then null;
    end;
    reset role;
  exception when others then reset role; raise;
  end;
end $$;

-- ---------------------------------------------------------------------------
-- Group moderation log (Batch 11): trigger-captured, manager-readable, RLS-locked.
-- ---------------------------------------------------------------------------
do $$
declare
  v_group uuid := 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  v_owner uuid := '11111111-1111-1111-1111-111111111111';
  v_outsider uuid := '33333333-3333-3333-3333-333333333333';
  v_rows bigint;
begin
  -- The three seeded memberships were captured by the trigger.
  if (select count(*) from public.raye2_group_moderation_log
        where group_id=v_group and action='member_added') <> 3 then
    raise exception 'MATRIX FAIL: the moderation trigger did not capture member additions';
  end if;

  -- A group status change is captured too (performed as the superuser session, actor null).
  update public.raye2_groups set status='read_only' where id=v_group;
  update public.raye2_groups set status='active' where id=v_group;
  if (select count(*) from public.raye2_group_moderation_log
        where group_id=v_group and action='group_status_changed') <> 2 then
    raise exception 'MATRIX FAIL: the moderation trigger did not capture group status changes';
  end if;

  -- The owner (manager) may read the log via RPC.
  begin
    set local role authenticated;
    perform set_config('request.jwt.claim.role','authenticated',true);
    perform set_config('request.jwt.claim.sub', v_owner::text, true);
    select count(*) into v_rows from public.raye2_list_group_moderation_log(v_group);
    if v_rows < 3 then raise exception 'MATRIX FAIL: the owner could not read the moderation log'; end if;
    reset role;
  exception when others then reset role; raise;
  end;

  -- The owner may read the table directly (RLS manager policy).
  begin
    set local role authenticated;
    perform set_config('request.jwt.claim.role','authenticated',true);
    perform set_config('request.jwt.claim.sub', v_owner::text, true);
    select count(*) into v_rows from public.raye2_group_moderation_log where group_id=v_group;
    if v_rows < 3 then raise exception 'MATRIX FAIL: RLS hid the log from a manager'; end if;
    reset role;
  exception when others then reset role; raise;
  end;

  -- A non-manager is denied by the RPC and sees nothing through RLS.
  begin
    set local role authenticated;
    perform set_config('request.jwt.claim.role','authenticated',true);
    perform set_config('request.jwt.claim.sub', v_outsider::text, true);
    begin
      perform public.raye2_list_group_moderation_log(v_group);
      raise exception 'MATRIX FAIL: a non-manager read the moderation log';
    exception when sqlstate '42501' then null;
    end;
    select count(*) into v_rows from public.raye2_group_moderation_log where group_id=v_group;
    if v_rows <> 0 then raise exception 'MATRIX FAIL: RLS exposed the log to a non-manager'; end if;
    reset role;
  exception when others then reset role; raise;
  end;

  -- Anonymous callers cannot read the log.
  begin
    set local role anon;
    perform set_config('request.jwt.claim.role','anon',true);
    begin
      perform public.raye2_list_group_moderation_log(v_group);
      raise exception 'MATRIX FAIL: anon could read the moderation log';
    exception when insufficient_privilege then null;
    end;
    reset role;
  exception when others then reset role; raise;
  end;
end $$;

-- ---------------------------------------------------------------------------
-- Chat polls (Batch 10): member-only create/vote/read, author/manager close.
-- ---------------------------------------------------------------------------
do $$
declare
  v_conv uuid := 'cccccccc-cccc-cccc-cccc-cccccccccccc';
  v_owner uuid := '11111111-1111-1111-1111-111111111111';
  v_admin uuid := '22222222-2222-2222-2222-222222222222';
  v_outsider uuid := '33333333-3333-3333-3333-333333333333';
  v_msg uuid;
  v_opt uuid;
  v_other uuid;
  v_state jsonb;
begin
  -- A non-member cannot create a poll.
  begin
    set local role authenticated;
    perform set_config('request.jwt.claim.role','authenticated',true);
    perform set_config('request.jwt.claim.sub', v_outsider::text, true);
    begin
      perform public.raye2_create_message_poll(v_conv,'Outsider?',array['a','b']);
      raise exception 'MATRIX FAIL: a non-member created a poll';
    exception when sqlstate '42501' then null;
    end;
    reset role;
  exception when others then reset role; raise;
  end;

  -- The owner creates a single-choice poll.
  begin
    set local role authenticated;
    perform set_config('request.jwt.claim.role','authenticated',true);
    perform set_config('request.jwt.claim.sub', v_owner::text, true);
    v_msg := public.raye2_create_message_poll(v_conv,'Ship it?',array['Yes','No'],false);
    reset role;
  exception when others then reset role; raise;
  end;
  if v_msg is null then raise exception 'MATRIX FAIL: the poll was not created'; end if;

  -- The owner votes; a single choice is accepted.
  select id into v_opt from public.raye2_message_poll_options where message_id=v_msg order by position limit 1;
  select id into v_other from public.raye2_message_poll_options where message_id=v_msg order by position offset 1 limit 1;
  begin
    set local role authenticated;
    perform set_config('request.jwt.claim.role','authenticated',true);
    perform set_config('request.jwt.claim.sub', v_owner::text, true);
    perform public.raye2_vote_message_poll(v_msg,array[v_opt]);
    reset role;
  exception when others then reset role; raise;
  end;

  -- The owner reads the poll back: exactly one vote, tallied on the chosen option.
  begin
    set local role authenticated;
    perform set_config('request.jwt.claim.role','authenticated',true);
    perform set_config('request.jwt.claim.sub', v_owner::text, true);
    v_state := public.raye2_get_message_poll(v_msg);
    reset role;
  exception when others then reset role; raise;
  end;
  if (v_state->>'total_votes')::int <> 1 then
    raise exception 'MATRIX FAIL: poll tallies are wrong (total_votes=%)', v_state->>'total_votes';
  end if;
  if jsonb_array_length(v_state->'my_votes') <> 1 then
    raise exception 'MATRIX FAIL: the caller''s own vote was not recorded';
  end if;

  -- Multiple choices on a single-choice poll are rejected.
  begin
    set local role authenticated;
    perform set_config('request.jwt.claim.role','authenticated',true);
    perform set_config('request.jwt.claim.sub', v_owner::text, true);
    begin
      perform public.raye2_vote_message_poll(v_msg,array[v_opt,v_other]);
      raise exception 'MATRIX FAIL: a single-choice poll accepted two options';
    exception when sqlstate '22023' then null;
    end;
    reset role;
  exception when others then reset role; raise;
  end;

  -- A non-member cannot read the poll.
  begin
    set local role authenticated;
    perform set_config('request.jwt.claim.role','authenticated',true);
    perform set_config('request.jwt.claim.sub', v_outsider::text, true);
    begin
      perform public.raye2_get_message_poll(v_msg);
      raise exception 'MATRIX FAIL: a non-member read the poll';
    exception when sqlstate '42501' then null;
    end;
    reset role;
  exception when others then reset role; raise;
  end;

  -- A non-author, non-manager member cannot close the poll (the admin is a manager, so use a fresh
  -- member-only voter to prove the negative). Add a plain member to the conversation first.
  insert into public.raye2_conversation_members(conversation_id,user_id)
    values (v_conv, v_outsider) on conflict do nothing;
  begin
    set local role authenticated;
    perform set_config('request.jwt.claim.role','authenticated',true);
    perform set_config('request.jwt.claim.sub', v_outsider::text, true);
    begin
      perform public.raye2_close_message_poll(v_msg);
      raise exception 'MATRIX FAIL: a non-author, non-manager closed the poll';
    exception when sqlstate '42501' then null;
    end;
    reset role;
  exception when others then reset role; raise;
  end;

  -- A group manager (the admin) may close the poll, after which voting is frozen.
  begin
    set local role authenticated;
    perform set_config('request.jwt.claim.role','authenticated',true);
    perform set_config('request.jwt.claim.sub', v_admin::text, true);
    perform public.raye2_close_message_poll(v_msg);
    reset role;
  exception when others then reset role; raise;
  end;
  if (select closed_at from public.raye2_message_polls where message_id=v_msg) is null then
    raise exception 'MATRIX FAIL: the manager close did not take effect';
  end if;
  begin
    set local role authenticated;
    perform set_config('request.jwt.claim.role','authenticated',true);
    perform set_config('request.jwt.claim.sub', v_owner::text, true);
    begin
      perform public.raye2_vote_message_poll(v_msg,array[v_other]);
      raise exception 'MATRIX FAIL: a closed poll accepted a vote';
    exception when sqlstate '55006' then null;
    end;
    reset role;
  exception when others then reset role; raise;
  end;
end $$;

-- ---------------------------------------------------------------------------
-- Denial invariants: anonymous callers must not reach any mutating write RPC.
-- ---------------------------------------------------------------------------
do $$
declare
  v_name text;
  v_guarded text[] := array[
    'public.raye2_update_group_profile(uuid,text,text,text,text[])',
    'public.raye2_list_group_moderation_log(uuid,integer)',
    'public.raye2_create_message_poll(uuid,text,text[],boolean)',
    'public.raye2_vote_message_poll(uuid,uuid[])',
    'public.raye2_close_message_poll(uuid)',
    'public.raye2_get_message_poll(uuid)',
    'public.raye2_reserve_storage(uuid,text,text,text,bigint,text,integer)',
    'public.raye2_commit_storage_object(uuid,text,text,bigint,text,text,text,text,uuid)',
    'public.raye2_release_storage_reservation(uuid,text)'
  ];
begin
  foreach v_name in array v_guarded loop
    if has_function_privilege('anon', v_name, 'execute') then
      raise exception 'MATRIX FAIL: anon holds execute on %', v_name;
    end if;
  end loop;
end $$;

\echo 'RLS behavioral matrix: all checks passed'
