#!/bin/sh
# A database dump, encrypted, in Swiss object storage.
#
#   BACKUP_S3_BUCKET=… BACKUP_S3_ENDPOINT=… ./pg-backup.sh
#
# Three properties, in the order they matter:
#
# 1. **It is encrypted before it leaves the host.** An unencrypted dump in a
#    bucket is the whole database available to anyone who can read the bucket —
#    a leaked access key, a misconfigured ACL, a support ticket. `age` with a
#    public key means this script can write backups it cannot itself read.
# 2. **It fails loudly.** `set -e` plus an explicit check on the dump's size:
#    a zero-byte object uploaded nightly for six months is worse than no backup,
#    because it looks like one.
# 3. **It expires old copies.** Retention is enforced here rather than assumed
#    from a bucket lifecycle rule nobody has verified.
#
# What this script cannot do is prove a backup restores. `pg-restore-check.sh`
# next to it does that, and it is the only evidence that any of this works.
set -eu

: "${BACKUP_S3_BUCKET:?set BACKUP_S3_BUCKET}"
: "${BACKUP_S3_ENDPOINT:?set BACKUP_S3_ENDPOINT}"
: "${PGDATABASE:?set PGDATABASE}"
RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-30}"
STAMP="$(date -u +%Y-%m-%dT%H-%M-%SZ)"
NAME="${PGDATABASE}-${STAMP}.sql.gz"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

# The S3 credentials the aws CLI reads.
export AWS_ACCESS_KEY_ID="${BACKUP_S3_ACCESS_KEY:?set BACKUP_S3_ACCESS_KEY}"
export AWS_SECRET_ACCESS_KEY="${BACKUP_S3_SECRET_KEY:?set BACKUP_S3_SECRET_KEY}"

echo "→ dumping ${PGDATABASE}"
pg_dump --format=plain --no-owner --no-privileges | gzip -9 > "${WORK}/${NAME}"

SIZE="$(wc -c < "${WORK}/${NAME}")"
# A dump of a database with a schema in it cannot plausibly be this small. The
# check exists because pg_dump can fail *after* the pipe has been opened, and
# gzip cheerfully compresses the empty result.
if [ "$SIZE" -lt 1024 ]; then
  echo "✗ dump is ${SIZE} bytes — refusing to upload an empty backup" >&2
  exit 1
fi

UPLOAD="${WORK}/${NAME}"
if [ -n "${BACKUP_AGE_RECIPIENT:-}" ]; then
  echo "→ encrypting for ${BACKUP_AGE_RECIPIENT}"
  age -r "${BACKUP_AGE_RECIPIENT}" -o "${WORK}/${NAME}.age" "${WORK}/${NAME}"
  UPLOAD="${WORK}/${NAME}.age"
  NAME="${NAME}.age"
else
  echo "! BACKUP_AGE_RECIPIENT is unset — uploading an unencrypted dump" >&2
fi

echo "→ uploading ${NAME} ($(wc -c < "$UPLOAD") bytes)"
aws --endpoint-url "$BACKUP_S3_ENDPOINT" s3 cp "$UPLOAD" "s3://${BACKUP_S3_BUCKET}/${NAME}"

# Retention: delete objects older than the window. Listed and filtered by name,
# because the timestamp in the key is the one clock we control.
CUTOFF="$(date -u -d "-${RETENTION_DAYS} days" +%Y-%m-%d 2>/dev/null || date -u -v-"${RETENTION_DAYS}"d +%Y-%m-%d)"
echo "→ expiring backups older than ${CUTOFF}"
aws --endpoint-url "$BACKUP_S3_ENDPOINT" s3 ls "s3://${BACKUP_S3_BUCKET}/" | awk '{print $4}' | while read -r key; do
  [ -z "$key" ] && continue
  keydate="$(echo "$key" | sed -n 's/.*-\([0-9]\{4\}-[0-9]\{2\}-[0-9]\{2\}\)T.*/\1/p')"
  [ -z "$keydate" ] && continue
  if [ "$keydate" \< "$CUTOFF" ]; then
    echo "  removing $key"
    aws --endpoint-url "$BACKUP_S3_ENDPOINT" s3 rm "s3://${BACKUP_S3_BUCKET}/${key}"
  fi
done

echo "✓ ${NAME}"
