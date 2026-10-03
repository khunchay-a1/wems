#!/usr/bin/env bash
# Daily logical backup of the WEMS database (docs/09-nfr.md §3, runbook docs/runbooks/backup-restore.md).
# pg_dump (custom format) → age encryption to the backup public key → local dir and, when set,
# an S3 bucket in another location. The decryption key never lives on this machine.
#
# Env: DATABASE_URL (required), BACKUP_AGE_RECIPIENT (age public key, required),
#      BACKUP_DIR (default /var/backups/wems), BACKUP_S3_URI (e.g. s3://wems-backup/db, optional),
#      AWS_* / AWS_ENDPOINT_URL for the S3 upload, BACKUP_KEEP_LOCAL_DAYS (default 7)
set -euo pipefail

: "${DATABASE_URL:?DATABASE_URL is required}"
: "${BACKUP_AGE_RECIPIENT:?BACKUP_AGE_RECIPIENT (age public key) is required}"
BACKUP_DIR="${BACKUP_DIR:-/var/backups/wems}"
KEEP_DAYS="${BACKUP_KEEP_LOCAL_DAYS:-7}"
stamp="$(date -u +%Y%m%dT%H%M%SZ)"
out="$BACKUP_DIR/wems-db-$stamp.dump.age"
db_url="${DATABASE_URL%%\?*}" # drop Prisma-only query parameters (?schema=…)

mkdir -p "$BACKUP_DIR"
umask 077
pg_dump --format=custom --compress=6 --no-owner --no-privileges "$db_url" \
  | age --encrypt --recipient "$BACKUP_AGE_RECIPIENT" --output "$out.part"
mv "$out.part" "$out"
sha256sum "$out" > "$out.sha256"
echo "backup written: $out ($(du -h "$out" | cut -f1))"

if [ -n "${BACKUP_S3_URI:-}" ]; then
  aws s3 cp --only-show-errors "$out" "$BACKUP_S3_URI/$(basename "$out")"
  aws s3 cp --only-show-errors "$out.sha256" "$BACKUP_S3_URI/$(basename "$out").sha256"
  echo "uploaded to $BACKUP_S3_URI"
fi

find "$BACKUP_DIR" -name 'wems-db-*.dump.age*' -mtime +"$KEEP_DAYS" -delete
