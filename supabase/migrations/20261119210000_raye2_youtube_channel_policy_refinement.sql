-- Keep public reads and admin management separate to avoid overlapping permissive SELECT policies.
drop policy if exists raye2_youtube_promo_channels_admin_manage on public.raye2_youtube_promo_channels;
drop policy if exists raye2_youtube_promo_channels_public_read on public.raye2_youtube_promo_channels;

create policy raye2_youtube_promo_channels_public_read
  on public.raye2_youtube_promo_channels
  for select to anon
  using (enabled = true);

create policy raye2_youtube_promo_channels_authenticated_read
  on public.raye2_youtube_promo_channels
  for select to authenticated
  using (
    enabled = true
    or exists (
      select 1 from public.creator_admins a
      where a.user_id = (select auth.uid())
        and a.active = true
        and a.role in ('owner','admin')
    )
  );

create policy raye2_youtube_promo_channels_admin_insert
  on public.raye2_youtube_promo_channels
  for insert to authenticated
  with check (
    exists (
      select 1 from public.creator_admins a
      where a.user_id = (select auth.uid())
        and a.active = true
        and a.role in ('owner','admin')
    )
  );

create policy raye2_youtube_promo_channels_admin_update
  on public.raye2_youtube_promo_channels
  for update to authenticated
  using (
    exists (
      select 1 from public.creator_admins a
      where a.user_id = (select auth.uid())
        and a.active = true
        and a.role in ('owner','admin')
    )
  )
  with check (
    exists (
      select 1 from public.creator_admins a
      where a.user_id = (select auth.uid())
        and a.active = true
        and a.role in ('owner','admin')
    )
  );

create policy raye2_youtube_promo_channels_admin_delete
  on public.raye2_youtube_promo_channels
  for delete to authenticated
  using (
    exists (
      select 1 from public.creator_admins a
      where a.user_id = (select auth.uid())
        and a.active = true
        and a.role in ('owner','admin')
    )
  );
