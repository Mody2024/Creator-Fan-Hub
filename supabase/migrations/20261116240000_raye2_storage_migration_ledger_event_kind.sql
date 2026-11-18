-- Raye2 storage lifecycle repair: allow the object-migration ledger event kind.
--
-- raye2_complete_object_migration records an 'object_migrated' event in
-- raye2_storage_usage_ledger, but the ledger's event_kind check (from
-- 20261115190000_raye2_multi_provider_storage_control_plane) never listed that
-- kind, so every BYOS object migration failed at commit time with a check
-- violation. The original migration applied cleanly, so this is a forward-only
-- repair rather than an in-place edit. Additive; `main` unchanged.

alter table public.raye2_storage_usage_ledger
  drop constraint if exists raye2_storage_usage_ledger_event_kind_check;

alter table public.raye2_storage_usage_ledger
  add constraint raye2_storage_usage_ledger_event_kind_check
  check (event_kind in (
    'upload_verified','object_deleted','object_reconciled',
    'replica_created','replica_removed','reservation_expired',
    'manual_adjustment','object_migrated'
  ));
