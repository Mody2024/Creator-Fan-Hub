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
--   owner   1111…  group owner (also poll author, watch host, media owner)
--   admin   2222…  group admin
--   outsider 3333… member of the group but not a manager; not in the group conversation
--   clipper 4444…  publishes a community clip from the owner's media
--   group   aaaa…  public active group with a group conversation cccc…
--   media   dddd…  published, ready video owned by the owner
--   clip    eeee…  published clip by the clipper
--   object  ffff…  storage object owned by the owner

-- ---------------------------------------------------------------------------
-- Seed (runs as the superuser session; deterministic ids make this idempotent).
-- ---------------------------------------------------------------------------
do $$
begin
  delete from public.raye2_groups where id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  delete from public.raye2_storage_objects where object_id = 'ffffffff-ffff-ffff-ffff-ffffffffffff';

  insert into auth.users(id,email) values
    ('11111111-1111-1111-1111-111111111111','matrix-owner@raye2.test'),
    ('22222222-2222-2222-2222-222222222222','matrix-admin@raye2.test'),
    ('33333333-3333-3333-3333-333333333333','matrix-outsider@raye2.test'),
    ('44444444-4444-4444-4444-444444444444','matrix-clipper@raye2.test'),
    ('55555555-5555-5555-5555-555555555555','matrix-newcomer@raye2.test')
  on conflict (id) do nothing;

  insert into public.member_profiles(user_id,handle,display_name) values
    ('11111111-1111-1111-1111-111111111111','raye2matrixowner','Matrix Owner'),
    ('22222222-2222-2222-2222-222222222222','raye2matrixadmin','Matrix Admin'),
    ('33333333-3333-3333-3333-333333333333','raye2matrixoutsider','Matrix Outsider'),
    ('44444444-4444-4444-4444-444444444444','raye2matrixclipper','Matrix Clipper'),
    ('55555555-5555-5555-5555-555555555555','raye2matrixnewcomer','Matrix Newcomer')
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
    ('cccccccc-cccc-cccc-cccc-cccccccccccc','22222222-2222-2222-2222-222222222222'),
    ('cccccccc-cccc-cccc-cccc-cccccccccccc','55555555-5555-5555-5555-555555555555');

  -- A published, ready video the owner can clip and watch. video_catalog carries its own RLS and
  -- write rules, so seed it directly as the superuser session. The asset-metadata trigger forces a
  -- freshly attached object to 'uploaded', so mark it ready with a follow-up update (processing_status
  -- is outside the trigger's column list).
  insert into public.media_items(id,title,media_type,is_published,owner_id,processing_status,provider,playback_kind)
  values ('dddddddd-dddd-dddd-dddd-dddddddddddd','Matrix Source Video','video',true,
          '11111111-1111-1111-1111-111111111111','ready','supabase','file');
  update public.media_items set processing_status='ready' where id='dddddddd-dddd-dddd-dddd-dddddddddddd';
  insert into public.video_catalog(media_id,slug,description,category,tags,featured,allow_comments,published_at,updated_at)
  values ('dddddddd-dddd-dddd-dddd-dddddddddddd','raye2-matrix-source','Matrix source','general','{}',false,true,now(),now());

  insert into public.raye2_community_clips(
    id,clipper_id,source_media_id,source_owner_id,source_title,attribution_text,title,
    storage_path,duration_seconds,visibility,status,expires_at)
  values ('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee','44444444-4444-4444-4444-444444444444',
          'dddddddd-dddd-dddd-dddd-dddddddddddd','11111111-1111-1111-1111-111111111111',
          'Matrix Source Video','@raye2matrixowner','Matrix Clip',
          '44444444-4444-4444-4444-444444444444/clip.mp4',30,'public','published',now()+interval '30 days');

  insert into public.raye2_storage_objects(
    object_id,provider_id,bucket_id,object_key,owner_id,asset_class,visibility,object_state,
    size_bytes,mime_type,idempotency_key)
  values ('ffffffff-ffff-ffff-ffff-ffffffffffff','supabase','raye2-media','matrix/object.bin',
          '11111111-1111-1111-1111-111111111111','other','private','active',2048,'application/octet-stream',
          'matrix-object');

  -- Watch Together ships disabled; the owner enables it through the platform rules (as the Admin
  -- Rules Engine would). The session RPC refuses to run otherwise.
  update public.raye2_platform_rules
    set status='active', rule_value='true'::jsonb
    where rule_key in ('watch.enabled','watch.public_sessions.enabled');
  update public.raye2_platform_rules
    set status='active'
    where rule_key in ('watch.max_participants','watch.session.max_duration_seconds');
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
-- Community clip permalinks and share-to-chat (Batch: clip permalink/share).
-- ---------------------------------------------------------------------------
do $$
declare
  v_owner uuid := '11111111-1111-1111-1111-111111111111';
  v_admin uuid := '22222222-2222-2222-2222-222222222222';
  v_clipper uuid := '44444444-4444-4444-4444-444444444444';
  v_conv uuid := 'cccccccc-cccc-cccc-cccc-cccccccccccc';
  v_clip uuid := 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee';
  v_n integer;
  v_code text;
begin
  -- Anyone holding the link can fetch a published, unlisted clip; the RPC re-checks permissions.
  update public.raye2_community_clips set visibility='unlisted' where id=v_clip;
  begin
    set local role anon;
    perform set_config('request.jwt.claim.role','anon',true);
    perform set_config('request.jwt.claim.sub','',true);
    select count(*) into v_n from public.raye2_get_community_clip(v_clip);
    reset role;
  exception when others then reset role; raise;
  end;
  if v_n <> 1 then raise exception 'MATRIX FAIL: an unlisted clip was not reachable by link (n=%)', v_n; end if;

  -- A removed clip disappears for the public but stays visible to its source owner.
  update public.raye2_community_clips set status='removed' where id=v_clip;
  begin
    set local role anon;
    perform set_config('request.jwt.claim.role','anon',true);
    perform set_config('request.jwt.claim.sub','',true);
    select count(*) into v_n from public.raye2_get_community_clip(v_clip);
    reset role;
  exception when others then reset role; raise;
  end;
  if v_n <> 0 then raise exception 'MATRIX FAIL: a removed clip stayed public (n=%)', v_n; end if;
  begin
    set local role authenticated;
    perform set_config('request.jwt.claim.role','authenticated',true);
    perform set_config('request.jwt.claim.sub', v_owner::text, true);
    select count(*) into v_n from public.raye2_get_community_clip(v_clip);
    reset role;
  exception when others then reset role; raise;
  end;
  if v_n <> 1 then raise exception 'MATRIX FAIL: the source owner could not see a removed clip'; end if;
  update public.raye2_community_clips set status='published', visibility='public' where id=v_clip;

  -- A conversation member may share a live clip; the message is server-authored.
  begin
    set local role authenticated;
    perform set_config('request.jwt.claim.role','authenticated',true);
    perform set_config('request.jwt.claim.sub', v_owner::text, true);
    select result_code into v_code from public.raye2_share_clip_to_chat(v_conv, v_clip);
    reset role;
  exception when others then reset role; raise;
  end;
  if v_code <> 'shared' then raise exception 'MATRIX FAIL: clip share did not succeed (%)', v_code; end if;
  if (select count(*) from public.raye2_messages where conversation_id=v_conv and attachment->>'kind'='clip_share') < 1 then
    raise exception 'MATRIX FAIL: the shared clip message was not written';
  end if;

  -- A group manager who is a conversation member may also share.
  begin
    set local role authenticated;
    perform set_config('request.jwt.claim.role','authenticated',true);
    perform set_config('request.jwt.claim.sub', v_admin::text, true);
    select result_code into v_code from public.raye2_share_clip_to_chat(v_conv, v_clip);
    reset role;
  exception when others then reset role; raise;
  end;
  if v_code <> 'shared' then raise exception 'MATRIX FAIL: a member could not share a clip'; end if;

  -- A non-member cannot share into a conversation they do not belong to.
  begin
    set local role authenticated;
    perform set_config('request.jwt.claim.role','authenticated',true);
    perform set_config('request.jwt.claim.sub', v_clipper::text, true);
    begin
      perform public.raye2_share_clip_to_chat(v_conv, v_clip);
      raise exception 'MATRIX FAIL: a non-member shared a clip into a conversation';
    exception when sqlstate '42501' then null;
    end;
    reset role;
  exception when others then reset role; raise;
  end;
end $$;

-- ---------------------------------------------------------------------------
-- Storage lifecycle: owner-scoped access and service-role-only privileged RPCs.
-- ---------------------------------------------------------------------------
do $$
declare
  v_owner uuid := '11111111-1111-1111-1111-111111111111';
  v_admin uuid := '22222222-2222-2222-2222-222222222222';
  v_outsider uuid := '33333333-3333-3333-3333-333333333333';
  v_object uuid := 'ffffffff-ffff-ffff-ffff-ffffffffffff';
  v_n integer;
  v_deleted boolean;
begin
  -- The owner sees only their own object; a different member sees none.
  begin
    set local role authenticated;
    perform set_config('request.jwt.claim.role','authenticated',true);
    perform set_config('request.jwt.claim.sub', v_owner::text, true);
    select count(*) into v_n from public.raye2_my_storage_objects(100);
    reset role;
  exception when others then reset role; raise;
  end;
  if v_n <> 1 then raise exception 'MATRIX FAIL: the owner did not see their own object (n=%)', v_n; end if;
  begin
    set local role authenticated;
    perform set_config('request.jwt.claim.role','authenticated',true);
    perform set_config('request.jwt.claim.sub', v_outsider::text, true);
    select count(*) into v_n from public.raye2_my_storage_objects(100);
    reset role;
  exception when others then reset role; raise;
  end;
  if v_n <> 0 then raise exception 'MATRIX FAIL: a non-owner saw another member''s object (n=%)', v_n; end if;

  -- The cross-owner admin listing requires platform-admin rights.
  begin
    set local role authenticated;
    perform set_config('request.jwt.claim.role','authenticated',true);
    perform set_config('request.jwt.claim.sub', v_admin::text, true);
    begin
      perform public.raye2_admin_storage_objects(200);
      raise exception 'MATRIX FAIL: a non-platform-admin listed every object';
    exception when sqlstate '42501' then null;
    end;
    reset role;
  exception when others then reset role; raise;
  end;

  -- A member cannot request deletion of an object they do not own.
  begin
    set local role authenticated;
    perform set_config('request.jwt.claim.role','authenticated',true);
    perform set_config('request.jwt.claim.sub', v_outsider::text, true);
    begin
      perform public.raye2_request_object_deletion(v_object);
      raise exception 'MATRIX FAIL: a non-owner requested deletion of another member''s object';
    exception when sqlstate '22023' then null;
    end;
    reset role;
  exception when others then reset role; raise;
  end;

  -- The owner requests deletion; the object moves to 'deleting' and the call is idempotent.
  begin
    set local role authenticated;
    perform set_config('request.jwt.claim.role','authenticated',true);
    perform set_config('request.jwt.claim.sub', v_owner::text, true);
    select already_deleted into v_deleted from public.raye2_request_object_deletion(v_object);
    reset role;
  exception when others then reset role; raise;
  end;
  if v_deleted then raise exception 'MATRIX FAIL: a fresh deletion was reported as already deleted'; end if;
  if (select object_state from public.raye2_storage_objects where object_id=v_object) <> 'deleting' then
    raise exception 'MATRIX FAIL: the object did not move to the deleting state';
  end if;

  -- Provider reconciliation is service-role only.
  begin
    set local role authenticated;
    perform set_config('request.jwt.claim.role','authenticated',true);
    perform set_config('request.jwt.claim.sub', v_owner::text, true);
    begin
      perform public.raye2_sync_storage_providers('[]'::jsonb);
      raise exception 'MATRIX FAIL: a member ran the service-role provider sync';
    exception when sqlstate '42501' then null;
    end;
    reset role;
  exception when others then reset role; raise;
  end;
  begin
    set local role service_role;
    perform set_config('request.jwt.claim.role','service_role',true);
    perform set_config('request.jwt.claim.sub','',true);
    perform public.raye2_sync_storage_providers('[]'::jsonb);
    reset role;
  exception when others then reset role; raise;
  end;
end $$;

-- ---------------------------------------------------------------------------
-- Disappearing messages and group slow mode (Batch 9): manager-only settings,
-- server-stamped expiry and server-enforced slow mode.
-- ---------------------------------------------------------------------------
do $$
declare
  v_admin uuid := '22222222-2222-2222-2222-222222222222';
  v_outsider uuid := '33333333-3333-3333-3333-333333333333';
  v_newcomer uuid := '55555555-5555-5555-5555-555555555555';
  v_group uuid := 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  v_conv uuid := 'cccccccc-cccc-cccc-cccc-cccccccccccc';
  v_n integer;
begin
  -- A non-manager cannot set a group conversation's disappearing window or the group slow mode.
  begin
    set local role authenticated;
    perform set_config('request.jwt.claim.role','authenticated',true);
    perform set_config('request.jwt.claim.sub', v_outsider::text, true);
    begin
      perform public.raye2_set_conversation_disappearing(v_conv, 86400);
      raise exception 'MATRIX FAIL: a non-manager set a group disappearing window';
    exception when sqlstate '42501' then null;
    end;
    begin
      perform public.raye2_set_group_slow_mode(v_group, 60);
      raise exception 'MATRIX FAIL: a non-manager set group slow mode';
    exception when sqlstate '42501' then null;
    end;
    reset role;
  exception when others then reset role; raise;
  end;

  -- A manager sets a valid window and the server rejects an out-of-policy one.
  begin
    set local role authenticated;
    perform set_config('request.jwt.claim.role','authenticated',true);
    perform set_config('request.jwt.claim.sub', v_admin::text, true);
    perform public.raye2_set_conversation_disappearing(v_conv, 86400);
    begin
      perform public.raye2_set_conversation_disappearing(v_conv, 3600);
      raise exception 'MATRIX FAIL: an out-of-policy disappearing window was accepted';
    exception when sqlstate '22023' then null;
    end;
    perform public.raye2_set_group_slow_mode(v_group, 3600);
    reset role;
  exception when others then reset role; raise;
  end;
  if (select disappearing_seconds from public.raye2_conversations where id=v_conv) <> 86400 then
    raise exception 'MATRIX FAIL: the disappearing window did not persist';
  end if;
  if (select slow_mode_seconds from public.raye2_groups where id=v_group) <> 3600 then
    raise exception 'MATRIX FAIL: group slow mode did not persist';
  end if;

  -- A new message is server-stamped with the conversation's window; a rapid second message is
  -- blocked by slow mode. (The newcomer has not written to this conversation yet.)
  begin
    set local role authenticated;
    perform set_config('request.jwt.claim.role','authenticated',true);
    perform set_config('request.jwt.claim.sub', v_newcomer::text, true);
    insert into public.raye2_messages(conversation_id,sender_id,body) values (v_conv,v_newcomer,'hello');
    reset role;
  exception when others then reset role; raise;
  end;
  if (select expires_at is not null from public.raye2_messages
        where conversation_id=v_conv and sender_id=v_newcomer order by created_at desc limit 1) is not true then
    raise exception 'MATRIX FAIL: the disappearing window was not stamped onto the message';
  end if;
  begin
    set local role authenticated;
    perform set_config('request.jwt.claim.role','authenticated',true);
    perform set_config('request.jwt.claim.sub', v_newcomer::text, true);
    begin
      insert into public.raye2_messages(conversation_id,sender_id,body) values (v_conv,v_newcomer,'again');
      raise exception 'MATRIX FAIL: slow mode did not block a rapid second message';
    exception when sqlstate '55006' then null;
    end;
    reset role;
  exception when others then reset role; raise;
  end;
end $$;

-- ---------------------------------------------------------------------------
-- Watch Together scheduled sessions and private invitation links.
-- ---------------------------------------------------------------------------
do $$
declare
  v_owner uuid := '11111111-1111-1111-1111-111111111111';
  v_admin uuid := '22222222-2222-2222-2222-222222222222';
  v_outsider uuid := '33333333-3333-3333-3333-333333333333';
  v_conv uuid := 'cccccccc-cccc-cccc-cccc-cccccccccccc';
  v_media uuid := 'dddddddd-dddd-dddd-dddd-dddddddddddd';
  v_session uuid;
  v_invite uuid;
  v_revoked uuid;
  v_token text := repeat('a', 48);
  v_join uuid;
  v_scheduled uuid;
begin
  -- The host creates an immediate private session.
  begin
    set local role authenticated;
    perform set_config('request.jwt.claim.role','authenticated',true);
    perform set_config('request.jwt.claim.sub', v_owner::text, true);
    v_session := public.raye2_create_watch_session(v_conv,'Matrix Watch','private','native',v_media,null,null,null);
    reset role;
  exception when others then reset role; raise;
  end;
  if v_session is null then raise exception 'MATRIX FAIL: the watch session was not created'; end if;

  -- A non-host cannot mint an invitation link.
  begin
    set local role authenticated;
    perform set_config('request.jwt.claim.role','authenticated',true);
    perform set_config('request.jwt.claim.sub', v_outsider::text, true);
    begin
      perform public.raye2_create_watch_session_invite(v_session, repeat('b',48), now()+interval '1 day', null);
      raise exception 'MATRIX FAIL: a non-host created a watch invitation';
    exception when sqlstate '42501' then null;
    end;
    reset role;
  exception when others then reset role; raise;
  end;

  -- The host mints a link; an outsider redeems it and joins.
  begin
    set local role authenticated;
    perform set_config('request.jwt.claim.role','authenticated',true);
    perform set_config('request.jwt.claim.sub', v_owner::text, true);
    v_invite := public.raye2_create_watch_session_invite(v_session, v_token, now()+interval '1 day', 5);
    reset role;
  exception when others then reset role; raise;
  end;
  if v_invite is null then raise exception 'MATRIX FAIL: the host could not create a watch invitation'; end if;
  begin
    set local role authenticated;
    perform set_config('request.jwt.claim.role','authenticated',true);
    perform set_config('request.jwt.claim.sub', v_outsider::text, true);
    v_join := public.raye2_join_watch_session_invite(v_token);
    reset role;
  exception when others then reset role; raise;
  end;
  if v_join <> v_session then raise exception 'MATRIX FAIL: redeeming the invite did not join the session'; end if;
  if not exists(select 1 from public.raye2_watch_participants
        where session_id=v_session and user_id=v_outsider and status='joined') then
    raise exception 'MATRIX FAIL: the invitee was not recorded as a participant';
  end if;

  -- A revoked link can no longer be redeemed.
  begin
    set local role authenticated;
    perform set_config('request.jwt.claim.role','authenticated',true);
    perform set_config('request.jwt.claim.sub', v_owner::text, true);
    v_revoked := public.raye2_create_watch_session_invite(v_session, repeat('c',48), now()+interval '1 day', null);
    perform public.raye2_revoke_watch_session_invite(v_revoked);
    reset role;
  exception when others then reset role; raise;
  end;
  begin
    set local role authenticated;
    perform set_config('request.jwt.claim.role','authenticated',true);
    perform set_config('request.jwt.claim.sub', v_outsider::text, true);
    begin
      perform public.raye2_join_watch_session_invite(repeat('c',48));
      raise exception 'MATRIX FAIL: a revoked invitation was redeemed';
    exception when sqlstate '42501' then null;
    end;
    reset role;
  exception when others then reset role; raise;
  end;

  -- A future scheduled session is not yet joinable.
  begin
    set local role authenticated;
    perform set_config('request.jwt.claim.role','authenticated',true);
    perform set_config('request.jwt.claim.sub', v_owner::text, true);
    v_scheduled := public.raye2_create_watch_session(v_conv,'Matrix Watch Later','private','native',v_media,null,null,now()+interval '2 days');
    reset role;
  exception when others then reset role; raise;
  end;
  begin
    set local role authenticated;
    perform set_config('request.jwt.claim.role','authenticated',true);
    perform set_config('request.jwt.claim.sub', v_admin::text, true);
    begin
      perform public.raye2_join_watch_session_guarded(v_scheduled);
      raise exception 'MATRIX FAIL: a not-yet-started scheduled session was joinable';
    exception when sqlstate '55000' then null;
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
    'public.raye2_share_clip_to_chat(uuid,uuid)',
    'public.raye2_my_storage_objects(integer)',
    'public.raye2_request_object_deletion(uuid)',
    'public.raye2_admin_storage_objects(integer)',
    'public.raye2_sync_storage_providers(jsonb)',
    'public.raye2_set_conversation_disappearing(uuid,integer)',
    'public.raye2_set_group_slow_mode(uuid,integer)',
    'public.raye2_create_watch_session_invite(uuid,text,timestamp with time zone,integer)',
    'public.raye2_revoke_watch_session_invite(uuid)',
    'public.raye2_join_watch_session_invite(text)',
    'public.raye2_create_watch_session(uuid,text,text,text,uuid,text,integer,timestamp with time zone)',
    'public.raye2_join_watch_session_guarded(uuid)',
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
