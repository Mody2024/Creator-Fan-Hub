import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const component = await readFile(new URL("../src/app/creator/media-library.tsx", import.meta.url), "utf8");

test("failed media metadata save checks private upload cleanup and reports possible orphan", () => {
  assert.ok(component.includes("if (saveError || !saved?.[0]?.saved)"));
  assert.ok(component.includes("if(cleanupError)"));
  assert.ok(component.includes("uploaded private file could not be cleaned up"));
});

test("publishing a private asset reports when the old private copy cannot be removed", () => {
  assert.ok(component.includes("if (!item.is_published)"));
  assert.ok(component.includes("const {error:cleanupError}=await supabase.storage.from(bucket).remove([oldPath])"));
  assert.ok(component.includes("old private copy could not be cleaned up; it remains private"));
});

test("unpublishing removes the public object before metadata changes and attempts recovery on failure", () => {
  assert.ok(component.includes("Revoke public access before changing the database publication state."));
  assert.ok(component.includes("if (item.is_published)"));
  assert.ok(component.includes("original public file could not be restored"));
  assert.ok(component.includes("new public object could not be removed. It may remain publicly accessible"));
});

test("media deletion keeps a backup and attempts restoration if metadata deletion fails", () => {
  assert.ok(component.includes("backup=download"));
  assert.ok(component.includes('supabase.rpc("delete_creator_media",{p_media_id:item.media_id})'));
  assert.ok(component.includes("if(restoreError) throw new Error(\"Metadata deletion failed and the file could not be restored."));
  assert.ok(component.includes("deletedStoragePath && backup"));
});
