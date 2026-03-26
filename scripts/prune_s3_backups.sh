#!/usr/bin/env bash
set -euo pipefail

S3_BUCKET="30dd63ad-b8ad-48a9-9fb7-c545973fac8d"
S3_PREFIX="nuran/db"
S3_ENDPOINT="https://s3.twcstorage.ru"
KEEP=14

cd /var/www/nuran

set -a
source .env
set +a

send_telegram() {
  local message="$1"

  if [ -z "${TELEGRAM_BOT_TOKEN:-}" ] || [ -z "${TELEGRAM_CHAT_ID:-}" ]; then
    return 0
  fi

  curl -s -X POST "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage" \
    -d "chat_id=${TELEGRAM_CHAT_ID}" \
    --data-urlencode "text=${message}" > /dev/null || true
}

TMP_FILE="$(mktemp)"
trap 'rm -f "$TMP_FILE"' EXIT

aws s3 ls "s3://${S3_BUCKET}/${S3_PREFIX}/" \
  --endpoint-url "${S3_ENDPOINT}" \
  | awk '{print $4}' \
  | grep '^nuran_.*\.sql\.gz$' \
  > "$TMP_FILE"

TOTAL="$(wc -l < "$TMP_FILE" | tr -d ' ')"

if [ "$TOTAL" -le "$KEEP" ]; then
  echo "S3 prune skipped: total=${TOTAL}, keep=${KEEP}"
  exit 0
fi

DELETE_COUNT=$((TOTAL - KEEP))

echo "S3 prune: total=${TOTAL}, keep=${KEEP}, deleting=${DELETE_COUNT}"

DELETED_LIST=""

head -n "$DELETE_COUNT" "$TMP_FILE" | while read -r file; do
  [ -n "$file" ] || continue
  echo "Deleting s3://${S3_BUCKET}/${S3_PREFIX}/${file}"

  aws s3 rm "s3://${S3_BUCKET}/${S3_PREFIX}/${file}" \
    --endpoint-url "${S3_ENDPOINT}"

  DELETED_LIST="${DELETED_LIST}\n- ${file}"
done

send_telegram "🧹 Nuran S3 prune: deleted ${DELETE_COUNT} old backups"

echo "S3 prune completed."
