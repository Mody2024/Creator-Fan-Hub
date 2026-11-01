-- Trigger functions cannot be invoked as ordinary SQL functions. Granting EXECUTE
-- allows authenticated clients' Storage INSERT statements to fire the guarded trigger;
-- the function still validates the caller's active reservation before accepting an object.
grant execute on function public.enforce_nhen_storage_upload_reservation() to authenticated;
