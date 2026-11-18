import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const catalogGate = await readFile(new URL("../supabase/migrations/20261107230000_raye2_gate_watch_catalog_on_processing.sql", import.meta.url), "utf8");
const mediaGate = await readFile(new URL("../supabase/migrations/20261107220000_raye2_processing_gated_media_publication.sql", import.meta.url), "utf8");
const lifecycle = await readFile(new URL("../supabase/migrations/20261107200000_raye2_media_processing_lifecycle.sql", import.meta.url), "utf8");
const queue = await readFile(new URL("../supabase/migrations/20261107210000_raye2_self_hosted_media_worker_queue.sql", import.meta.url), "utf8");

test("native watch pages cannot publish until trusted processing is ready", () => {
  assert.ok(catalogGate.includes("v_media.processing_status is distinct from 'ready'"));
  assert.ok(catalogGate.includes("native video must finish trusted media processing"));
  assert.ok(catalogGate.includes("v_media.media_type<>'youtube'"));
  assert.ok(catalogGate.includes("grant execute on function public.save_raye2_video_catalog"));
});

test("YouTube remains an external source and bypasses the local processing requirement", () => {
  assert.ok(catalogGate.includes("v_media.media_type<>'youtube'"));
  assert.ok(catalogGate.includes("and m.media_type in ('video','youtube')"));
});

test("native media publication still requires a public storage object", () => {
  assert.ok(catalogGate.includes("and not v_media.is_published"));
  assert.ok(mediaGate.includes("v_media.processing_status is distinct from 'ready'"));
  assert.ok(mediaGate.includes("v_bucket<>'creator-media-public'"));
});

test("only the trusted worker can change processing state to ready", () => {
  assert.ok(queue.includes("auth.role() is distinct from 'service_role'"));
  assert.ok(queue.includes("processing_status=case when p_success then 'ready' else 'failed' end"));
  assert.ok(queue.includes("m.processing_lease_token=p_lease_token"));
});

test("processing status is exposed only to the authenticated owning creator", () => {
  assert.ok(lifecycle.includes("where m.owner_id=auth.uid()"));
  assert.ok(lifecycle.includes("creator access required"));
  assert.ok(lifecycle.includes("grant execute on function public.get_creator_media_processing_status(uuid[]) to authenticated"));
});
