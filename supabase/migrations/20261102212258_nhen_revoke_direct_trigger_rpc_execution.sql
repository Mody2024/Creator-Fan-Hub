-- Trigger functions are implementation details, not callable RPC endpoints.
-- PostgreSQL invokes attached trigger functions without granting API callers EXECUTE.
revoke all on function public.enforce_nhen_storage_upload_reservation() from public, anon, authenticated;
revoke all on function public.sync_nhen_creator_media_asset_metadata() from public, anon, authenticated;
revoke all on function public.touch_member_profile() from public, anon, authenticated;
notify pgrst, 'reload schema';
