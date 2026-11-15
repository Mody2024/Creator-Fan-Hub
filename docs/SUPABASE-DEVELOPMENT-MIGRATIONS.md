# Applying reviewed Supabase development migrations

The repository's complete 233-file migration chain passed an isolated local Supabase replay on the readiness patch branch. The connected development project still has recorded migration drift; local success is not the same as cloud application.

The workflow `.github/workflows/supabase-development-migrate.yml` is a guarded owner-operated gate:
- Default action is **dry-run**.
- It links only project ref `scxkgybuodhuohcxpfat`.
- It prints local/remote migration history and previews pending SQL.
- It applies only when the owner selects `apply`, enters `APPLY_DEVELOPMENT`, and confirms a fresh verified backup with `BACKUP_VERIFIED`.
- It has no production project ref and never targets `main` or production.

## Required owner secrets

Add these under GitHub repository **Settings → Secrets and variables → Actions → Secrets** only when ready:
- `SUPABASE_ACCESS_TOKEN` — personal Supabase access token used by the CLI.
- `SUPABASE_DB_PASSWORD` — database password for the dedicated development project.

Never put either value in a commit, workflow input, issue, log or chat.

## Safe order

1. Configure and run the encrypted database + Storage backup workflow.
2. Download the artifact, decrypt both files locally and verify the PostgreSQL dump is readable.
3. Run the migration workflow with `action=dry-run`.
4. Review the full pending migration list and SQL output. Stop if there are unexpected drops, data rewrites, extension changes, policy broadening or unexplained drift.
5. Only after a tested recovery copy and explicit owner review, run with `action=apply`, `confirm_apply=APPLY_DEVELOPMENT`, and `confirm_backup=BACKUP_VERIFIED`.
6. Re-run migration list and perform database-backed acceptance tests.
7. Production remains excluded. A separate release plan and explicit owner approval are required before any production operation.
