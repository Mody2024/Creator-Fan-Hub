# Raye2 database and Storage backup/restore

## Purpose and limits

The scheduled workflow `.github/workflows/supabase-backup.yml` runs weekly. It creates:
- A PostgreSQL custom-format dump using `pg_dump`.
- A read-only export of every Supabase Storage bucket and object.
- Separate age-encrypted files for the database and Storage archive.

Only encrypted files and non-sensitive run metadata are uploaded to GitHub Actions. Plaintext dumps and Storage files live only in a temporary runner directory and are removed when the job exits. The artifact is retained for 14 days to limit free artifact-storage use.

This is a **short rolling recovery copy**, not permanent archival. GitHub automatically expires workflow artifacts. Download important backups to storage you control before they expire. Supabase Free projects can be paused after a week of low database activity. Supabase currently documents a one-year restore window for paused Free projects, but this is not a permanent archive and does not protect against deliberate project deletion or account loss. Free projects do not receive Supabase-managed automatic database backups.

PostgreSQL dumps and Storage object exports do not capture every Supabase project setting. Auth provider configuration, SMTP settings, Edge Function secrets, API keys, custom domains, project settings and external provider credentials must be documented/recreated separately. A restore into a new Supabase project needs a reviewed schema/auth migration process; do not assume a raw database dump can be blindly restored into managed system schemas.

## Owner setup — do this near release, after implementation

1. Generate an age identity on a trusted device using the official age tool: `age-keygen -o raye2-backup-identity.txt`.
2. Keep the private identity line beginning with `AGE-SECRET-KEY-` offline in at least two safe places. Never commit it or send it in chat.
3. Copy the public recipient line beginning with `age1` into GitHub repository **Settings → Secrets and variables → Actions → Variables** as `RAYE2_BACKUP_AGE_RECIPIENT`.
4. Add the direct PostgreSQL connection string as the GitHub Actions **Secret** `SUPABASE_DB_URL`. If IPv6 is unavailable on the runner, use the session pooler connection string and its correct port/user.
5. Add the Supabase service-role key as the GitHub Actions **Secret** `SUPABASE_SERVICE_ROLE_KEY`. It is used only in the backup job and must never be committed or exposed to browser code.
6. Run **Actions → Supabase encrypted backup → Run workflow** and confirm the encrypted database and Storage files appear.
7. Download one artifact and verify that both files decrypt on your trusted device before relying on it.

The backup job refuses to run if any required value is missing. No credentials are needed to build or test the rest of the application.

## Restore drill

Keep the age identity file offline as `raye2-backup-identity.txt`. Download an artifact and decrypt the files:

```sh
age --decrypt --identity raye2-backup-identity.txt raye2-postgres-<run-id>.dump.age > raye2-postgres.dump
age --decrypt --identity raye2-backup-identity.txt raye2-storage-<run-id>.tar.gz.age | tar -xz
pg_restore --list raye2-postgres.dump
```

After creating and validating a separate empty recovery database, a database restore can be rehearsed with:

```sh
pg_restore --clean --if-exists --no-owner --no-acl --dbname "$RECOVERY_DATABASE_URL" raye2-postgres.dump
```

After the required Storage buckets exist in the recovery project, set `NEXT_PUBLIC_SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` in a private shell and run:

```sh
node scripts/raye2-storage-restore.mjs storage
```

The Storage restore script verifies each object's path and byte size before upload. It upserts objects present in the backup and **does not delete objects absent from the backup**.

Never point a restore command at production without a separate verified backup, a reviewed change window and explicit owner approval.

## Permanent-free availability reality

- The existing activity-check workflow makes small read-only API requests three times per day. It improves activity visibility but **cannot guarantee** Supabase will never pause a Free project.
- A Free Supabase project can still be paused under provider inactivity or policy rules. No GitHub script can override Supabase platform controls.
- Weekly backups reduce data-loss risk but do not keep the database online; artifacts expire after 14 days.
- Always-on media processing, voice relay and live streaming need a continuously running machine/network. Open-source software removes license/API fees, not compute, storage, bandwidth, electricity or hardware costs.
- To avoid unexpected charges, do not enable paid upgrades or usage-based add-ons. If a provider requires a paid tier for a required reliability guarantee, treat that feature as unavailable until the owner chooses a genuinely free alternative.

## Release gates

- [ ] First encrypted database and Storage backup succeeds.
- [ ] Owner confirms private age identity is safely stored offline.
- [ ] Both encrypted files are downloaded and decrypted successfully.
- [ ] Database restore is rehearsed against an isolated recovery database.
- [ ] Storage restore is rehearsed in an isolated recovery project.
- [ ] Owner downloads an offline backup copy before the 14-day artifact expiry.
- [ ] Supabase Free pause/deletion limitations are understood and accepted.
