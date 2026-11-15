# Raye2 database backup and restore

## Purpose and limits

The scheduled workflow `.github/workflows/supabase-backup.yml` creates a PostgreSQL custom-format dump once per day, encrypts it with age, and stores the encrypted artifact in GitHub Actions for 90 days.

This is a **rolling recovery copy**, not permanent archival. GitHub automatically expires workflow artifacts after the configured retention period. A free hosted database and free CI do not provide a contractual guarantee against provider suspension, deletion, quota changes, or account loss. Keep an offline copy of the age identity (private key) and periodically download important backups to storage you control.

The backup workflow is deliberately inactive until the owner adds the two configuration values below. It never writes database contents to the repository and never stores plaintext dumps as workflow artifacts.

## Owner setup — do this near release, after all features are implemented

1. Generate an age identity on a trusted device using the official age tool: `age-keygen -o raye2-backup-identity.txt`.
2. Keep the private identity line beginning with `AGE-SECRET-KEY-` offline in at least two safe places. Never commit it or send it in chat.
3. Copy the public recipient line beginning with `age1` into GitHub repository **Settings → Secrets and variables → Actions → Variables** as `RAYE2_BACKUP_AGE_RECIPIENT`.
4. Add the database connection string as the GitHub Actions **Secret** `SUPABASE_DB_URL`. Use the direct PostgreSQL connection string from the Supabase dashboard; if IPv6 is unavailable on the runner, use the session pooler connection string and its correct port/user.
5. Run **Actions → Supabase encrypted backup → Run workflow** and confirm an encrypted artifact appears.
6. Download one artifact and verify it decrypts on your trusted device before relying on it.

## Restore drill

Keep the age identity file offline as `raye2-backup-identity.txt`. Download an encrypted artifact and run:

```sh
age --decrypt --identity raye2-backup-identity.txt raye2-postgres-<run-id>.dump.age > raye2-postgres.dump
pg_restore --list raye2-postgres.dump
```

For an actual restore, create a separate empty recovery database and review the target carefully before running:

```sh
pg_restore --clean --if-exists --no-owner --no-acl --dbname "$RECOVERY_DATABASE_URL" raye2-postgres.dump
```

Never point a restore command at production without a separate verified backup, a reviewed change window, and explicit owner approval.

## Permanent-free availability reality

- The existing activity-check workflow makes small read-only API requests three times per day. It improves activity visibility but **cannot guarantee** Supabase will never pause a Free project.
- A Free Supabase project can still be paused under provider inactivity or policy rules. No GitHub script can override Supabase's platform controls.
- A scheduled backup reduces data-loss risk but does not keep the database online.
- Always-on media processing, voice relay and live streaming need a continuously running machine/network. Open-source software removes license/API fees, not compute, storage, bandwidth, electricity or hardware costs.
- To avoid unexpected charges, do not enable paid upgrades or usage-based add-ons. If a provider requires a paid tier for a required reliability guarantee, treat that feature as unavailable until the owner chooses a genuinely free alternative.

## Release gates

- [ ] First encrypted backup succeeds.
- [ ] Owner confirms private age identity is safely stored offline.
- [ ] A backup is downloaded and decrypted successfully.
- [ ] Restore listing is readable and a test restore succeeds in an isolated database.
- [ ] Backup artifact retention and external offline-copy cadence are understood.
- [ ] The owner accepts that Supabase Free does not guarantee zero pauses or zero deletion risk.
