#!/usr/bin/env bash
set -euo pipefail

BACKUP_DIR="/var/backups/nuran"
TIMESTAMP="$(date +%Y%m%d_%H%M%S)"
BACKUP_FILE="${BACKUP_DIR}/nuran_${TIMESTAMP}.sql.gz"

cd "$(dirname "${BASH_SOURCE[0]}")/.."

if [ ! -f ".env" ]; then
  echo "Error: .env file not found at repo root. Create it from .env.example before running backups." >&2
  exit 1
fi

set -a
# shellcheck disable=SC1091
source .env
set +a

mkdir -p "${BACKUP_DIR}"

echo "Creating PostgreSQL backup at ${BACKUP_FILE} ..."
docker compose -f infra/docker-compose.yml exec -T db \
  pg_dump -U "${POSTGRES_USER:-${DB_USER:-postgres}}" "${POSTGRES_DB:-${DB_NAME:-nuran}}" \
  | gzip > "${BACKUP_FILE}"

echo "Backup created."

echo "Rotating backups, keeping the 7 most recent..."
ls -1t "${BACKUP_DIR}"/nuran_*.sql.gz 2>/dev/null | tail -n +8 | xargs -r rm --

echo "Done."

