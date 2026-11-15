-- Raye2 Wave 4: captions and subtitles for native media.
--
-- Plan 4.1 requires the player to expose captions, and plan 2.3 requires caption/subtitle support with
-- accessible media controls. Nothing in the repository stored or served captions. This migration adds a
-- per-media caption track (WebVTT stored in the same public creator-media bucket) and owner-only RPCs to
-- manage it. Reads are public for published media only, matching every other media read surface.

create table if not exists public.raye2_media_captions (
  id uuid primary key default gen_random_uuid(),
  media_id uuid not null references public.media_items(id) on delete cascade,
  language text not null check (language in ('en','ar')),
  label text not null default '' check (char_length(label) <= 60),
  storage_path text not null check (storage_path ~ '^creator-media-public/'),
  status text not null default 'published' check (status in ('published','removed')),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (media_id, language)
);
alter table public.raye2_media_captions enable row level security;
-- Reads go through raye2_get_media_captions; the table itself is not directly writable or readable.
revoke all on public.raye2_media_captions from anon, authenticated;
create index if not exists raye2_media_captions_media_idx on public.raye2_media_captions(media_id, language);

-- Owner-only upsert. The path must live in the public creator-media bucket and end in .vtt so the player can
-- consume it; the media must be owned by the caller.
create or replace function public.raye2_set_media_caption(
  p_media_id uuid,
  p_language text,
  p_storage_path text,
  p_label text default ''
)
returns text language plpgsql security definer set search_path=''
as $$
declare
  v_uid uuid := auth.uid();
  v_path text := btrim(coalesce(p_storage_path, ''));
  v_label text := btrim(coalesce(p_label, ''));
begin
  if v_uid is null then raise exception 'sign in required' using errcode='42501'; end if;
  if not exists (select 1 from public.media_items where id = p_media_id and owner_id = v_uid) then
    raise exception 'you do not own this media' using errcode='42501';
  end if;
  if p_language is null or p_language not in ('en','ar') then
    raise exception 'unsupported caption language' using errcode='22023';
  end if;
  if v_path !~ ('^creator-media-public/' || v_uid::text || '/') or v_path !~ '\.vtt$' or char_length(v_path) > 400 then
    raise exception 'caption file must be a .vtt inside your own creator-media-public folder' using errcode='22023';
  end if;
  if char_length(v_label) > 60 then
    raise exception 'caption label is too long' using errcode='22023';
  end if;
  insert into public.raye2_media_captions(media_id, language, label, storage_path, status, created_by, updated_at)
  values (p_media_id, p_language, v_label, v_path, 'published', v_uid, now())
  on conflict (media_id, language) do update
    set label = excluded.label, storage_path = excluded.storage_path, status = 'published', updated_at = now();
  return 'published';
end;
$$;
revoke all on function public.raye2_set_media_caption(uuid,text,text,text) from public,anon;
grant execute on function public.raye2_set_media_caption(uuid,text,text,text) to authenticated;

-- Owner-only removal (soft delete so a re-add is idempotent).
create or replace function public.raye2_remove_media_caption(p_media_id uuid, p_language text)
returns text language plpgsql security definer set search_path=''
as $$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'sign in required' using errcode='42501'; end if;
  if not exists (select 1 from public.media_items where id = p_media_id and owner_id = v_uid) then
    raise exception 'you do not own this media' using errcode='42501';
  end if;
  update public.raye2_media_captions set status='removed', updated_at=now()
   where media_id = p_media_id and language = p_language;
  return 'removed';
end;
$$;
revoke all on function public.raye2_remove_media_caption(uuid,text) from public,anon;
grant execute on function public.raye2_remove_media_caption(uuid,text) to authenticated;

-- Public read for published media only.
create or replace function public.raye2_get_media_captions(p_media_id uuid)
returns table (language text, label text, storage_path text)
language sql stable security definer set search_path=''
as $$
  select c.language, c.label, c.storage_path
  from public.raye2_media_captions c
  join public.media_items m on m.id = c.media_id
  where c.media_id = p_media_id
    and c.status = 'published'
    and m.is_published = true
    and m.processing_status = 'ready'
  order by c.language asc;
$$;
revoke all on function public.raye2_get_media_captions(uuid) from public;
grant execute on function public.raye2_get_media_captions(uuid) to anon, authenticated;

-- The creator's own caption tracks, including any removed, for the studio editor.
create or replace function public.raye2_get_my_media_captions(p_media_id uuid)
returns table (language text, label text, storage_path text, status text, updated_at timestamptz)
language sql stable security definer set search_path=''
as $$
  select c.language, c.label, c.storage_path, c.status, c.updated_at
  from public.raye2_media_captions c
  join public.media_items m on m.id = c.media_id
  where c.media_id = p_media_id and m.owner_id = (select auth.uid())
  order by c.language asc;
$$;
revoke all on function public.raye2_get_my_media_captions(uuid) from public,anon;
grant execute on function public.raye2_get_my_media_captions(uuid) to authenticated;

notify pgrst, 'reload schema';
