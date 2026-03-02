#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")/.."

if [ $# -ne 1 ]; then
  echo "Usage: $0 /var/backups/nuran/nuran_YYYYMMDD_HHMMSS.sql.gz" >&2
  exit 1
fi

BACKUP_FILE="$1"

if [ ! -f "${BACKUP_FILE}" ]; then
  echo "Error: Backup file not found: ${BACKUP_FILE}" >&2
  exit 1
fi

read -rp "This will restore the database inside the running 'db' container and may overwrite data. Continue? [y/N] " CONFIRM
if [[ "${CONFIRM}" != "y" && "${CONFIRM}" != "Y" ]]; then
  echo "Aborted."
  exit 0
fi

if [ ! -f ".env" ]; then
  echo "Error: .env file not found at repo root. Create it from .env.example before restoring." >&2
  exit 1
fi

set -a
# shellcheck disable=SC1091
source .env
set +a

DB_USER="${POSTGRES_USER:-${DB_USER:-postgres}}"
DB_NAME="${POSTGRES_DB:-${DB_NAME:-nuran}}"

echo "Restoring ${BACKUP_FILE} into database '${DB_NAME}' as user '${DB_USER}' ..."
gunzip -c "${BACKUP_FILE}" | docker compose -f infra/docker-compose.yml exec -T db psql -U "${DB_USER}" "${DB_NAME}"

echo "Restore completed."

