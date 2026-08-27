# Production Backup and Recovery

## Coverage and schedule

The `Production database backup` GitHub Actions workflow runs every six hours
and can also be started manually with **Actions > Production database backup >
Run workflow**. It creates a compressed PostgreSQL 17 custom-format dump of
the `public`, `auth`, and `supabase_migrations` schemas.

The dump includes application schema and data, functions, triggers, RLS
policies, grants, Supabase migration history, and Auth records required for
recovery. Supabase Storage objects are not included; production Storage is
currently empty and must receive a separate object-backup process if it is used
later.

## Storage and credentials

Backups are stored in the private Cloudflare R2 bucket under:

`production/YYYY/MM/DD/`

The workflow uses these GitHub Actions secrets:

- `SUPABASE_DB_URL`
- `R2_ACCESS_KEY_ID`
- `R2_SECRET_ACCESS_KEY`
- `R2_ENDPOINT`
- `R2_BUCKET_NAME`

Never place secret values, database URLs, dumps, or exported customer data in
the repository or workflow logs.

## Verification

Each run validates the dump with `pg_restore --list`, calculates a SHA-256
checksum, and uploads the dump plus a JSON manifest. The manifest contains only
the timestamp, filename, checksum, byte size, Git commit, latest migration,
safe row counts, and workflow run ID.

After upload, the workflow verifies the R2 object size and metadata, downloads
the object to temporary runner storage, and confirms its SHA-256 checksum. Any
connection, dump, checksum, upload, or verification failure fails the workflow.
Temporary runner files are removed whether the run succeeds or fails.

## Retention

The intended production retention is:

- Daily restore points: 35 days
- Weekly restore points: 12 weeks
- Monthly restore points: 12 months

The timestamped path is compatible with R2 lifecycle management. Lifecycle
rules and any weekly/monthly preservation process must be configured and
verified separately before automatic deletion is enabled.

## Recovery approach

Never restore a backup directly over production without explicit approval.
For recovery, download the selected dump and manifest, verify the SHA-256
checksum, and restore into an isolated PostgreSQL 17-compatible recovery
database. Validate migrations, row counts, relationships, Auth data, RLS, and
application behavior there first. Recover individual records or tables through
a separately reviewed transaction, or promote a full recovery only after a
documented reconciliation and production change approval.
