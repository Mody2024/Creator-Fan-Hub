drop policy if exists "Public follows visible" on public.member_follows;
create policy "Public follows visible" on public.member_follows for select to anon,authenticated
using(not public.is_member_blocked(follower_id) and not public.is_member_blocked(followed_id));
