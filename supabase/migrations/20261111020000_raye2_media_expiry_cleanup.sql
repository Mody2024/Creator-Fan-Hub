-- Raye2 Wave 9/11.3: queue physical deletion of expired temporary media.
--
-- Plan 11.3 requires that for every temporary content type "physical deletion is queued, retried and
-- observable", separate from the metadata, and that expired items become inaccessible immediately regardless
-- of when storage deletion completes. Mini's and community clips already became inaccessible on expiry, but
-- their storage objects were never queued for deletion: they lingered forever in the public buckets. This
-- records an observable cleanup row per expired asset and promotes it into a retried background job that the
-- trusted media worker executes against Storage.

-- 1. Observable queue of storage objects pending physical deletion.
create table if not exists public.raye2_media_storage_cleanup (
  id uuid primary key default gen_random_uuid(),
  bucket text not null check (char_length(bucket) between 1 and 100),
  storage_path text not null check (char_length(storage_path) between 1 and 500),
  source_kind text not null check (source_kind in ('mini','community_clip','community_short','other')),
  source_id uuid,
  status text not null default 'pending' check (status in ('pending','queued','deleted','failed')),
  job_id uuid references public.raye2_background_jobs(id) on delete set null,
  enqueued_at timestamptz,
  deleted_at timestamptz,
  last_error text check (last_error is null or char_length(last_error) <= 1000),
  created_at timestamptz not null default now()
);
create index if not exists raye2_media_storage_cleanup_status_idx on public.raye2_media_storage_cleanup(status, created_at);
create unique index if not exists raye2_media_storage_cleanup_object_idx on public.raye2_media_storage_cleanup(bucket, storage_path) where status <> 'deleted';
alter table public.raye2_media_storage_cleanup enable row level security;
revoke all on public.raye2_media_storage_cleanup from anon, authenticated;

-- 2. Expiry now also records the binary for deletion. Metadata status flips immediately (content is hidden
--    at once); the storage object is only queued, never deleted inline.
create or replace function public.raye2_expire_minis()
returns integer language plpgsql security definer set search_path=''
as $$
declare v_expired integer := 0;
begin
  with due as (
    update public.raye2_minis set status='expired'
    where status='published' and expires_at <= now()
    returning id, storage_path
  ), queued as (
    insert into public.raye2_media_storage_cleanup(bucket, storage_path, source_kind, source_id)
    select 'raye2-minis', d.storage_path, 'mini', d.id from due d
    on conflict do nothing
    returning 1
  )
  select count(*) into v_expired from due;
  return v_expired;
end;
$$;
revoke all on function public.raye2_expire_minis() from public;
grant execute on function public.raye2_expire_minis() to anon, authenticated;

create or replace function public.raye2_expire_community_clips()
returns integer language plpgsql security definer set search_path=''
as $$
declare v_expired integer := 0;
begin
  with due as (
    update public.raye2_community_clips set status='expired'
    where status='published' and expires_at <= now()
    returning id, storage_path
  ), queued as (
    insert into public.raye2_media_storage_cleanup(bucket, storage_path, source_kind, source_id)
    select 'raye2-clips', d.storage_path, 'community_clip', d.id from due d
    on conflict do nothing
    returning 1
  )
  select count(*) into v_expired from due;
  return v_expired;
end;
$$;
revoke all on function public.raye2_expire_community_clips() from public;
grant execute on function public.raye2_expire_community_clips() to anon, authenticated;

-- 3. Promote pending cleanup rows into retried background jobs (trusted worker only).
create or replace function public.raye2_enqueue_storage_cleanup(p_limit integer default 50)
returns integer language plpgsql security definer set search_path=''
as $$
declare v_row public.raye2_media_storage_cleanup%rowtype; v_job uuid; v_count integer := 0;
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'trusted worker required' using errcode='42501';
  end if;
  for v_row in
    select * from public.raye2_media_storage_cleanup
    where status = 'pending'
    order by created_at asc
    limit least(greatest(coalesce(p_limit, 50), 1), 500)
    for update skip locked
  loop
    insert into public.raye2_background_jobs(kind, payload, priority, idempotency_key, max_attempts, created_by)
    values ('storage.delete',
            jsonb_build_object('cleanup_id', v_row.id, 'bucket', v_row.bucket, 'path', v_row.storage_path),
            0, 'storage_cleanup:' || v_row.id::text, 5, null)
    on conflict (idempotency_key) do nothing
    returning id into v_job;
    if v_job is null then
      select id into v_job from public.raye2_background_jobs where idempotency_key = 'storage_cleanup:' || v_row.id::text;
    end if;
    update public.raye2_media_storage_cleanup
       set status = 'queued', job_id = v_job, enqueued_at = now()
     where id = v_row.id;
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;
revoke all on function public.raye2_enqueue_storage_cleanup(integer) from public, anon, authenticated;
grant execute on function public.raye2_enqueue_storage_cleanup(integer) to service_role;

-- 4. Record the deletion outcome (trusted worker only). Success marks the object deleted; failure is
--    retried by the background-job lease/backoff and remains observable.
create or replace function public.raye2_record_storage_cleanup(p_cleanup_id uuid, p_success boolean, p_error text default null)
returns void language plpgsql security definer set search_path=''
as $$
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'trusted worker required' using errcode='42501';
  end if;
  if p_success then
    update public.raye2_media_storage_cleanup
       set status = 'deleted', deleted_at = now(), last_error = null
     where id = p_cleanup_id;
  else
    update public.raye2_media_storage_cleanup
       set status = 'failed', last_error = left(coalesce(p_error, 'deletion failed'), 1000)
     where id = p_cleanup_id;
  end if;
end;
$$;
revoke all on function public.raye2_record_storage_cleanup(uuid,boolean,text) from public, anon, authenticated;
grant execute on function public.raye2_record_storage_cleanup(uuid,boolean,text) to service_role;

-- 5. Observability for the admin control centre.
create or replace function public.raye2_get_storage_cleanup_stats()
returns jsonb language plpgsql stable security definer set search_path=''
as $$
declare v jsonb;
begin
  if not public.raye2_is_platform_admin() then raise exception 'platform admin access required' using errcode='42501'; end if;
  select jsonb_build_object(
    'by_status', coalesce((select jsonb_object_agg(s.status, s.n) from
      (select status, count(*) n from public.raye2_media_storage_cleanup group by status) s), '{}'::jsonb),
    'pending', (select count(*) from public.raye2_media_storage_cleanup where status in ('pending','queued')),
    'failed', (select count(*) from public.raye2_media_storage_cleanup where status = 'failed'),
    'deleted', (select count(*) from public.raye2_media_storage_cleanup where status = 'deleted'),
    'oldest_pending_at', (select min(created_at) from public.raye2_media_storage_cleanup where status in ('pending','queued'))
  ) into v;
  return v;
end;
$$;
revoke all on function public.raye2_get_storage_cleanup_stats() from public, anon;
grant execute on function public.raye2_get_storage_cleanup_stats() to authenticated;

-- 6. Let a worker claim only the job kinds it owns, so a storage worker never steals (and fails) a job
--    meant for another worker such as the account purge. Passing null keeps the original "any kind" behavior.
drop function if exists public.raye2_claim_background_job();
create or replace function public.raye2_claim_background_job(p_kind text default null)
returns table (job_id uuid, kind text, payload jsonb, attempts integer, max_attempts integer, lease_token uuid)
language plpgsql security definer set search_path=''
as $$
declare v_id uuid; v_token uuid := gen_random_uuid();
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'trusted worker required' using errcode='42501';
  end if;
  select j.id into v_id from public.raye2_background_jobs j
   where (
     (j.status = 'queued' and j.run_at <= now())
     or (j.status = 'running' and j.lease_until < now())
   )
   and (p_kind is null or j.kind = p_kind)
   order by j.priority desc, j.run_at asc, j.created_at asc
   for update skip locked limit 1;
  if v_id is null then return; end if;
  return query
   update public.raye2_background_jobs j
      set status = 'running', attempts = j.attempts + 1, lease_until = now() + interval '15 minutes',
          lease_token = v_token, updated_at = now()
    where j.id = v_id
    returning j.id, j.kind, j.payload, j.attempts, j.max_attempts, j.lease_token;
end;
$$;
revoke all on function public.raye2_claim_background_job(text) from public, anon, authenticated;
grant execute on function public.raye2_claim_background_job(text) to service_role;

notify pgrst, 'reload schema';
