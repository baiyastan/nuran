#!/usr/bin/env bash
# Professional PostgreSQL backup pipeline:
# - strict fail-fast behavior
# - integrity-first validation before encryption
# - GFS pathing (daily/weekly/monthly)
# - checksum generation + upload
# - security-focused passphrase handling
set -Eeuo pipefail

BACKUP_DIR="/var/backups/nuran"
HOSTNAME="$(hostname)"
TIMESTAMP="$(date +%Y%m%d_%H%M%S)"
BACKUP_ID="nuran_${TIMESTAMP}"

RAW_DUMP_FILE="${BACKUP_DIR}/${BACKUP_ID}.sql.gz"
ENCRYPTED_FILE="${RAW_DUMP_FILE}.gpg"
CHECKSUM_FILE="${ENCRYPTED_FILE}.sha256"
ERROR_LOG="${BACKUP_DIR}/${BACKUP_ID}.stderr.log"

S3_ROOT_PREFIX="nuran/db"

# 1 MiB default lower bound to detect obviously broken dumps.
# Tune this from .env for your dataset size/profile.
MIN_DUMP_SIZE_BYTES="${MIN_DUMP_SIZE_BYTES:-1048576}"

# Keep stderr duplicated to console and persisted for failure notifications.
mkdir -p "${BACKUP_DIR}"
exec 2> >(tee -a "${ERROR_LOG}" >&2)

cd "$(dirname "${BASH_SOURCE[0]}")/.."

if [ ! -f ".env" ]; then
  echo "Error: .env file not found at repo root. Create it from .env.example before running backups." >&2
  exit 1
fi

set -a
# shellcheck disable=SC1091
source .env
set +a

# Export AWS auth context immediately after sourcing so every subprocess inherits it.
export AWS_ACCESS_KEY_ID="${AWS_ACCESS_KEY_ID:-}"
export AWS_SECRET_ACCESS_KEY="${AWS_SECRET_ACCESS_KEY:-}"
export AWS_DEFAULT_REGION="${AWS_DEFAULT_REGION:-us-east-1}"

if [ -z "${AWS_ACCESS_KEY_ID}" ] || [ -z "${AWS_SECRET_ACCESS_KEY}" ]; then
  echo "Error: AWS_ACCESS_KEY_ID/AWS_SECRET_ACCESS_KEY must be set in .env." >&2
  exit 1
fi

if [ -z "${S3_BUCKET:-}" ] || [ -z "${S3_ENDPOINT:-}" ]; then
  echo "Error: S3_BUCKET and S3_ENDPOINT must be set in .env." >&2
  exit 1
fi

send_telegram() {
  local message="$1"

  if [ -z "${TELEGRAM_BOT_TOKEN:-}" ] || [ -z "${TELEGRAM_CHAT_ID:-}" ]; then
    echo "Telegram env vars are missing, skipping alert."
    return 0
  fi

  curl -sS -X POST "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage" \
    --data-urlencode "chat_id=${TELEGRAM_CHAT_ID}" \
    --data-urlencode "text=${message}" >/dev/null || true
}

run_aws() {
  env \
    AWS_ACCESS_KEY_ID="${AWS_ACCESS_KEY_ID}" \
    AWS_SECRET_ACCESS_KEY="${AWS_SECRET_ACCESS_KEY}" \
    AWS_DEFAULT_REGION="${AWS_DEFAULT_REGION}" \
    aws "$@"
  local aws_exit_code=$?
  if [ "${aws_exit_code}" -ne 0 ]; then
    echo "AWS command failed (exit=${aws_exit_code}): aws $*" >&2
    return "${aws_exit_code}"
  fi
}

cleanup() {
  # Wipe ephemeral sensitive material.
  if [ -n "${GPG_PASSFILE:-}" ] && [ -f "${GPG_PASSFILE}" ]; then
    rm -f -- "${GPG_PASSFILE}"
  fi
}

on_error() {
  local exit_code=$?
  local last_error="No stderr captured."

  if [ -f "${ERROR_LOG}" ]; then
    last_error="$(tail -n 15 "${ERROR_LOG}" | tr '\n' ' ' | sed 's/[[:space:]]\+/ /g')"
  fi

  send_telegram "❌ Nuran backup FAILED
Host: ${HOSTNAME}
Backup ID: ${BACKUP_ID}
Exit Code: ${exit_code}
Last Error: ${last_error}"

  cleanup
  exit "${exit_code}"
}

trap on_error ERR
trap cleanup EXIT

if [ -z "${GPG_PASSPHRASE:-}" ]; then
  echo "Error: GPG_PASSPHRASE is not set in .env." >&2
  exit 1
fi

# Determine GFS tier based on run date:
# - monthly: 1st day of month
# - weekly: Sunday, excluding 1st (monthly wins)
# - daily: everything else
day_of_month="$(date +%d)"
day_of_week="$(date +%u)" # 1=Mon ... 7=Sun

if [ "${day_of_month}" = "01" ]; then
  GFS_TIER="monthly"
elif [ "${day_of_week}" = "7" ]; then
  GFS_TIER="weekly"
else
  GFS_TIER="daily"
fi

DESTINATION_PATH="production/${GFS_TIER}"
S3_KEY_BACKUP="${S3_ROOT_PREFIX}/${DESTINATION_PATH}/$(basename "${ENCRYPTED_FILE}")"
S3_KEY_CHECKSUM="${S3_ROOT_PREFIX}/${DESTINATION_PATH}/$(basename "${CHECKSUM_FILE}")"

echo "Creating PostgreSQL dump: ${RAW_DUMP_FILE}"
docker compose -f infra/docker-compose.yml exec -T db \
  pg_dump -U "${POSTGRES_USER:-${DB_USER:-postgres}}" "${POSTGRES_DB:-${DB_NAME:-nuran}}" \
  | gzip -9 > "${RAW_DUMP_FILE}"

# Integrity gate #1: gzip stream should be valid.
gzip -t "${RAW_DUMP_FILE}"

# Integrity gate #2: size threshold catches many truncated/empty dumps.
dump_size_bytes="$(stat -c%s "${RAW_DUMP_FILE}")"
if [ "${dump_size_bytes}" -lt "${MIN_DUMP_SIZE_BYTES}" ]; then
  echo "Error: Dump size ${dump_size_bytes} bytes is below threshold ${MIN_DUMP_SIZE_BYTES} bytes." >&2
  exit 1
fi

echo "Encrypting dump with GPG (AES-256, hardened S2K)..."
GPG_PASSFILE="$(mktemp "${BACKUP_DIR}/.gpg-pass.XXXXXX")"
chmod 600 "${GPG_PASSFILE}"
printf '%s' "${GPG_PASSPHRASE}" > "${GPG_PASSFILE}"

# Use passphrase file to avoid exposing secrets in process arguments.
gpg --batch --yes --pinentry-mode loopback \
  --symmetric --cipher-algo AES256 \
  --digest-algo SHA512 \
  --s2k-mode 3 --s2k-count 65011712 \
  --passphrase-file "${GPG_PASSFILE}" \
  --output "${ENCRYPTED_FILE}" \
  "${RAW_DUMP_FILE}"

# Generate checksum from encrypted artifact (what we actually store/restore).
sha256sum "${ENCRYPTED_FILE}" > "${CHECKSUM_FILE}"
SHA256_HEX="$(cut -d' ' -f1 "${CHECKSUM_FILE}")"

FILE_SIZE_BYTES="$(stat -c%s "${ENCRYPTED_FILE}")"
FILE_SIZE_MB="$(awk -v size="${FILE_SIZE_BYTES}" 'BEGIN { printf "%.2f", size/1024/1024 }')"

echo "Uploading encrypted backup to s3://${S3_BUCKET}/${S3_KEY_BACKUP}"
run_aws s3 cp "${ENCRYPTED_FILE}" "s3://${S3_BUCKET}/${S3_KEY_BACKUP}" \
  --endpoint-url "${S3_ENDPOINT}" \
  --metadata "sha256=${SHA256_HEX},backup_id=${BACKUP_ID},gfs_tier=${GFS_TIER}"

echo "Uploading checksum to s3://${S3_BUCKET}/${S3_KEY_CHECKSUM}"
run_aws s3 cp "${CHECKSUM_FILE}" "s3://${S3_BUCKET}/${S3_KEY_CHECKSUM}" \
  --endpoint-url "${S3_ENDPOINT}" \
  --metadata "sha256=${SHA256_HEX},backup_id=${BACKUP_ID},related_object=${S3_KEY_BACKUP}"

# Verification step for remote object presence after upload.
run_aws s3 ls "s3://${S3_BUCKET}/${S3_KEY_BACKUP}" --endpoint-url "${S3_ENDPOINT}" >/dev/null
run_aws s3 ls "s3://${S3_BUCKET}/${S3_KEY_CHECKSUM}" --endpoint-url "${S3_ENDPOINT}" >/dev/null

# Success-based retention model:
# This script intentionally does not delete backups.
# Retention windows (daily/weekly/monthly pruning) must be handled by S3 Lifecycle Policies.

send_telegram "✅ Nuran backup SUCCESS
Host: ${HOSTNAME}
Backup ID: ${BACKUP_ID}
Destination: s3://${S3_BUCKET}/${S3_KEY_BACKUP}
Size: ${FILE_SIZE_MB} MB
SHA256: ${SHA256_HEX}"

echo "Backup completed successfully."
