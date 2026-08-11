#!/bin/sh
# Prove the backup restores. Run it monthly — an untested backup is a belief.
#
#   BACKUP_S3_BUCKET=… BACKUP_S3_ENDPOINT=… \
#   BACKUP_AGE_IDENTITY=/path/to/age.key ./pg-restore-check.sh
#
# Pulls the newest object, decrypts it, restores it into a throwaway database
# beside the live one, and asserts the tables the app cannot run without are
# present and populated. Then it drops the throwaway database again.
#
# It reads the live server only to create and drop a scratch database; it never
# writes to the production one. Point PGHOST at a restore host instead if even
# that is more than you want to do against production.
set -eu

: "${BACKUP_S3_BUCKET:?set BACKUP_S3_BUCKET}"
: "${BACKUP_S3_ENDPOINT:?set BACKUP_S3_ENDPOINT}"
export AWS_ACCESS_KEY_ID="${BACKUP_S3_ACCESS_KEY:?set BACKUP_S3_ACCESS_KEY}"
export AWS_SECRET_ACCESS_KEY="${BACKUP_S3_SECRET_KEY:?set BACKUP_S3_SECRET_KEY}"

SCRATCH="restore_check_$(date -u +%Y%m%d%H%M%S)"
WORK="$(mktemp -d)"
cleanup() {
  rm -rf "$WORK"
  psql -d postgres -c "DROP DATABASE IF EXISTS ${SCRATCH};" >/dev/null 2>&1 || true
}
trap cleanup EXIT

LATEST="$(aws --endpoint-url "$BACKUP_S3_ENDPOINT" s3 ls "s3://${BACKUP_S3_BUCKET}/" | sort | awk 'END{print $4}')"
[ -n "$LATEST" ] || { echo "✗ the bucket is empty — there is no backup to restore" >&2; exit 1; }
echo "→ newest object: ${LATEST}"

aws --endpoint-url "$BACKUP_S3_ENDPOINT" s3 cp "s3://${BACKUP_S3_BUCKET}/${LATEST}" "${WORK}/dump"

FILE="${WORK}/dump"
case "$LATEST" in
  *.age)
    : "${BACKUP_AGE_IDENTITY:?the newest backup is encrypted; set BACKUP_AGE_IDENTITY to the private key}"
    age -d -i "$BACKUP_AGE_IDENTITY" -o "${WORK}/dump.gz" "$FILE"
    FILE="${WORK}/dump.gz"
    ;;
esac

echo "→ restoring into ${SCRATCH}"
psql -d postgres -c "CREATE DATABASE ${SCRATCH};" >/dev/null
gzip -dc "$FILE" | psql -q -d "$SCRATCH" >/dev/null

# The assertion. A dump that restores without error but contains no accounts is
# a dump of the wrong database, and it would look identical in a log.
USERS="$(psql -tAd "$SCRATCH" -c "SELECT count(*) FROM users;" 2>/dev/null || echo "missing")"
if [ "$USERS" = "missing" ]; then
  echo "✗ restored, but there is no users table — this is not a backup of this app" >&2
  exit 1
fi
if [ "$USERS" -lt 1 ]; then
  echo "✗ restored, but the users table is empty" >&2
  exit 1
fi

TABLES="$(psql -tAd "$SCRATCH" -c "SELECT count(*) FROM information_schema.tables WHERE table_schema='public';")"
echo "✓ ${LATEST} restores: ${TABLES} tables, ${USERS} accounts"
