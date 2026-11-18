-- Public reaction totals are intentionally aggregate-only endpoints.
-- Grant only the bounded aggregate RPCs; individual reaction rows remain private.
-- The community-short counter is granted later, after it is created in
-- 20261102190914_nhen_private_community_short_reactions.sql.
grant execute on function public.get_community_reaction_counts(uuid[]) to anon,authenticated;
grant execute on function public.get_video_reaction_counts(uuid[]) to anon,authenticated;
