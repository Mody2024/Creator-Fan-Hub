-- Raye2 Wave 5 saved-library depth: collection contents and lifecycle.
--
-- Collections could be created and added to, but there was no way to open a collection
-- and see what is inside it, and no way to rename or delete one. These owner-scoped RPCs
-- resolve collection contents server-side (posts and videos) and manage the collection
-- lifecycle, keeping every operation limited to the caller's own collections.
--
-- All are SECURITY DEFINER, pinned to an empty search_path and granted to authenticated
-- only. Each re-checks ownership before touching a collection.

-- Collection contents: the caller's own collection with its resolved items (published
-- posts with author attribution, published videos with title and slug), newest first.
create or replace function public.raye2_get_collection(
  p_collection_id uuid,
  p_limit integer default 100
)
returns table (
  collection_id uuid,
  name text,
  description text,
  item_count integer,
  created_at timestamptz,
  item_kind text,
  item_id uuid,
  title text,
  body text,
  author_handle text,
  author_display_name text,
  video_slug text,
  added_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $fn$
declare
  v_me uuid := (select auth.uid());
  v_collection public.raye2_collections;
  v_limit integer := least(greatest(coalesce(p_limit, 100), 1), 200);
begin
  if v_me is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;
  select * into v_collection from public.raye2_collections
  where id = p_collection_id and owner_id = v_me;
  if v_collection.id is null then
    return;
  end if;
  return query
    with items as (
      select i.item_kind, i.item_id, i.added_at
      from public.raye2_collection_items i
      where i.collection_id = v_collection.id
      order by i.added_at desc
      limit v_limit
    )
    select v_collection.id,
           v_collection.name,
           v_collection.description,
           (select count(*)::integer from public.raye2_collection_items x where x.collection_id = v_collection.id),
           v_collection.created_at,
           it.item_kind,
           it.item_id,
           case
             when it.item_kind = 'post' then left(cp.body, 240)
             when it.item_kind = 'video' then mi.title
             else null
           end as title,
           case when it.item_kind = 'post' then cp.body else coalesce(mi.alt_text, '') end as body,
           case when it.item_kind = 'post' then mp.handle else null end as author_handle,
           case when it.item_kind = 'post' then mp.display_name else null end as author_display_name,
           case when it.item_kind = 'video' then vc.slug else null end as video_slug,
           it.added_at
    from items it
    left join public.community_posts cp
      on it.item_kind = 'post' and cp.id = it.item_id and cp.status = 'published'
    left join public.member_profiles mp on mp.user_id = cp.author_id
    left join public.video_catalog vc
      on it.item_kind = 'video' and vc.media_id = it.item_id and vc.published_at is not null
    left join public.media_items mi
      on it.item_kind = 'video' and mi.id = it.item_id and mi.is_published = true
    where (it.item_kind = 'post' and cp.id is not null)
       or (it.item_kind = 'video' and vc.media_id is not null and mi.id is not null)
    order by it.added_at desc;
end;
$fn$;
revoke all on function public.raye2_get_collection(uuid,integer) from public, anon;
grant execute on function public.raye2_get_collection(uuid,integer) to authenticated;

-- Rename/redescribe one of the caller's own collections.
create or replace function public.raye2_update_collection(
  p_collection_id uuid,
  p_name text,
  p_description text default ''
)
returns void
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_me uuid := (select auth.uid());
begin
  if v_me is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;
  if p_name is null or char_length(btrim(p_name)) < 1 or char_length(btrim(p_name)) > 60 then
    raise exception 'collection name must be between 1 and 60 characters' using errcode = '22023';
  end if;
  if p_description is null or char_length(p_description) > 280 then
    raise exception 'collection description must be at most 280 characters' using errcode = '22023';
  end if;
  update public.raye2_collections
  set name = btrim(p_name), description = btrim(coalesce(p_description, ''))
  where id = p_collection_id and owner_id = v_me;
  if not found then
    raise exception 'collection not found' using errcode = '42501';
  end if;
end;
$fn$;
revoke all on function public.raye2_update_collection(uuid,text,text) from public, anon;
grant execute on function public.raye2_update_collection(uuid,text,text) to authenticated;

-- Delete one of the caller's own collections (items cascade).
create or replace function public.raye2_delete_collection(p_collection_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_me uuid := (select auth.uid());
begin
  if v_me is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;
  delete from public.raye2_collections where id = p_collection_id and owner_id = v_me;
  if not found then
    raise exception 'collection not found' using errcode = '42501';
  end if;
end;
$fn$;
revoke all on function public.raye2_delete_collection(uuid) from public, anon;
grant execute on function public.raye2_delete_collection(uuid) to authenticated;

notify pgrst, 'reload schema';
