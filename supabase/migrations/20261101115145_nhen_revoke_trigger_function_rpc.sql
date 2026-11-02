-- Trigger-only database functions are not RPC endpoints.
-- PostgreSQL executes attached trigger functions without requiring callers
-- to hold EXECUTE on the trigger function itself.
revoke all on function public.award_follow_achievements() from public, anon, authenticated;
revoke all on function public.award_post_achievements() from public, anon, authenticated;
revoke all on function public.award_video_comment_achievement() from public, anon, authenticated;
revoke all on function public.create_member_profile() from public, anon, authenticated;
revoke all on function public.notify_community_comment() from public, anon, authenticated;
revoke all on function public.notify_community_reaction() from public, anon, authenticated;
revoke all on function public.notify_member_follow() from public, anon, authenticated;
revoke all on function public.notify_video_comment() from public, anon, authenticated;
revoke all on function public.notify_video_reaction() from public, anon, authenticated;
