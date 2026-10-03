#!/usr/bin/env bash
# Restore a backup made by backup.sh into TARGET_DATABASE_URL and verify it
# (docs/runbooks/backup-restore.md). Refuses to restore over a database that has data unless
# RESTORE_FORCE=1 — restore into a fresh database first, check, then switch the app over.
#
#   BACKUP_AGE_IDENTITY=~/wems-backup.key TARGET_DATABASE_URL=postgresql://…/wems_restore \
#     infra/backup/restore.sh /var/backups/wems/wems-db-20261003T020000Z.dump.age
set -euo pipefail

file="${1:?usage: restore.sh <backup.dump.age>}"
: "${TARGET_DATABASE_URL:?TARGET_DATABASE_URL is required}"
: "${BACKUP_AGE_IDENTITY:?BACKUP_AGE_IDENTITY (age private key file) is required}"
target="${TARGET_DATABASE_URL%%\?*}"
here="$(cd "$(dirname "$0")" && pwd)"

if [ -f "$file.sha256" ]; then
  (cd "$(dirname "$file")" && sha256sum --check --quiet "$(basename "$file").sha256")
  echo "checksum OK"
fi

tables="$(psql "$target" -Atc "select count(*) from information_schema.tables where table_schema = 'public'")"
if [ "$tables" != "0" ] && [ "${RESTORE_FORCE:-0}" != "1" ]; then
  echo "target database is not empty ($tables tables); set RESTORE_FORCE=1 to overwrite" >&2
  exit 1
fi

age --decrypt --identity "$BACKUP_AGE_IDENTITY" "$file" \
  | pg_restore --clean --if-exists --no-owner --no-privileges --exit-on-error --dbname "$target"
echo "restored into $target"
psql "$target" -v ON_ERROR_STOP=1 -f "$here/verify.sql"
