import { validateSiteConfig } from "./site-config.mjs";

/**
 * Server-only publishing boundary.
 *
 * The repository adapter must authenticate/authorize the actor before calling
 * this function, and publishAtomically must re-check expectedDraftRevision and
 * write the snapshot, version history, and audit record in one database
 * transaction. Do not call this from browser code or trust a client-supplied
 * actor ID as proof of identity.
 */
export async function publishSiteConfig({
  repository,
  config,
  expectedDraftRevision,
  actorId
}) {
  if (!repository ||
      typeof repository.getDraftRevision !== "function" ||
      typeof repository.publishAtomically !== "function") {
    return { ok: false, code: "invalid_repository" };
  }

  if (typeof actorId !== "string" || actorId.trim().length === 0) {
    return { ok: false, code: "unauthorized" };
  }

  if (!Number.isInteger(expectedDraftRevision) || expectedDraftRevision < 1) {
    return { ok: false, code: "invalid_revision" };
  }

  const validation = validateSiteConfig(config);
  if (!validation.ok) {
    return { ok: false, code: "invalid_config", errors: validation.errors };
  }

  const current = await repository.getDraftRevision();
  if (!current || !Number.isInteger(current.revision)) {
    return { ok: false, code: "draft_not_found" };
  }

  if (current.revision !== expectedDraftRevision) {
    return {
      ok: false,
      code: "revision_conflict",
      currentRevision: current.revision
    };
  }

  // The adapter must enforce the expected revision again inside the transaction
  // to close the race between the read above and the publish write.
  const result = await repository.publishAtomically({
    config: validation.value,
    expectedDraftRevision,
    actorId
  });

  if (result?.conflict) {
    return {
      ok: false,
      code: "revision_conflict",
      currentRevision: result.currentRevision
    };
  }

  if (!result || !Number.isInteger(result.publishedVersion) || result.publishedVersion < 1) {
    return { ok: false, code: "publish_failed" };
  }

  return {
    ok: true,
    publishedVersion: result.publishedVersion,
    publishedAt: result.publishedAt ?? null
  };
}
