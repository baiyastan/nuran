#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="${REPO_ROOT:-/var/www/nuran}"
LOCK_FILE="${REPO_ROOT}/.deploy.lock"
LOG_FILE="${REPO_ROOT}/.deploy.log"
BRANCH="${BRANCH:-master}"

cd "${REPO_ROOT}"

exec >>"$LOG_FILE" 2>&1

exec 9>"${LOCK_FILE}"
if ! flock -n 9; then
  echo "[$(date -Iseconds)] Another deploy is in progress (lock: ${LOCK_FILE}). Exiting."
  exit 1
fi

echo "[$(date -Iseconds)] Starting deploy at ${REPO_ROOT} (branch=${BRANCH})"

git fetch origin "${BRANCH}"
git reset --hard "origin/${BRANCH}"

docker compose --env-file .env -f infra/docker-compose.yml up -d --build

docker image prune -f

echo "[$(date -Iseconds)] Deploy finished."