#!/usr/bin/env bash
# Idempotent deploy script: pull main and rebuild stack. Use with flock to avoid concurrent runs.
set -euo pipefail

REPO_ROOT="${REPO_ROOT:-/var/www/nuran}"
LOCK_FILE="${REPO_ROOT}/.deploy.lock"

cd "${REPO_ROOT}"

exec 9>"${LOCK_FILE}"
if ! flock -n 9; then
  echo "Another deploy is in progress (lock: ${LOCK_FILE}). Exiting." >&2
  exit 1
fi

echo "[$(date -Iseconds)] Starting deploy at ${REPO_ROOT}"

git pull origin main

docker compose -f infra/docker-compose.yml up -d --build

docker image prune -f

echo "[$(date -Iseconds)] Deploy finished."
