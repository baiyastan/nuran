#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="${REPO_ROOT:-/var/www/nuran}"
LOCK_FILE="${REPO_ROOT}/.deploy.lock"
LOG_FILE="${REPO_ROOT}/scripts/.deploy.log"
BRANCH="${BRANCH:-main}"
HEALTHCHECK_URL="${HEALTHCHECK_URL:-http://127.0.0.1/api/v1/healthz}"
COMPOSE_CMD=(docker compose --env-file .env -f infra/docker-compose.yml)

cd "${REPO_ROOT}"

exec >>"$LOG_FILE" 2>&1

exec 9>"${LOCK_FILE}"
if ! flock -n 9; then
  echo "[$(date -Iseconds)] Another deploy is in progress (lock: ${LOCK_FILE}). Exiting."
  exit 1
fi

# Load Telegram creds from .env if present (so alerts work even without -E).
if [ -f .env ]; then
  # shellcheck disable=SC1091
  set -a; . ./.env; set +a
fi

send_telegram() {
  local message="$1"
  if [ -z "${TELEGRAM_BOT_TOKEN:-}" ] || [ -z "${TELEGRAM_CHAT_ID:-}" ]; then
    return 0
  fi
  curl -sS -m 10 -X POST "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage" \
    --data-urlencode "chat_id=${TELEGRAM_CHAT_ID}" \
    --data-urlencode "text=${message}" >/dev/null || true
}

DEPLOY_START="$(date -Iseconds)"
echo "[${DEPLOY_START}] Starting deploy at ${REPO_ROOT} (branch=${BRANCH})"

PREV_SHA="$(git rev-parse HEAD 2>/dev/null || echo 'unknown')"
echo "[$(date -Iseconds)] Previous SHA: ${PREV_SHA}"

git fetch origin "${BRANCH}"
git reset --hard "origin/${BRANCH}"
NEW_SHA="$(git rev-parse HEAD)"
echo "[$(date -Iseconds)] New SHA: ${NEW_SHA}"

rollback() {
  local reason="$1"
  echo "[$(date -Iseconds)] DEPLOY FAILED: ${reason}. Rolling back to ${PREV_SHA}."
  if [ "${PREV_SHA}" != 'unknown' ] && [ "${PREV_SHA}" != "${NEW_SHA}" ]; then
    git reset --hard "${PREV_SHA}" || echo "[$(date -Iseconds)] git reset during rollback failed."
    "${COMPOSE_CMD[@]}" up -d --build --force-recreate --remove-orphans --no-deps backend nginx \
      || echo "[$(date -Iseconds)] compose up during rollback failed."
  else
    echo "[$(date -Iseconds)] Nothing to roll back to (PREV=${PREV_SHA}, NEW=${NEW_SHA})."
  fi
  send_telegram "❌ Nuran deploy FAILED on $(hostname)
Reason: ${reason}
Commit: ${NEW_SHA}
Rolled back to: ${PREV_SHA}"
  exit 1
}

# 1. Explicit migration step BEFORE we replace the running backend.
#    `run --rm` spins up a one-off container on the new image, so a broken
#    migration fails the deploy without ever touching the live service.
echo "[$(date -Iseconds)] Running migrations..."
if ! "${COMPOSE_CMD[@]}" build backend; then
  rollback "backend image build failed"
fi
if ! "${COMPOSE_CMD[@]}" run --rm backend python manage.py migrate --noinput; then
  rollback "migrations failed"
fi

# 2. Recreate backend + nginx (webhook is intentionally excluded to avoid
#    the webhook killing itself mid-deploy; rebuild it manually when hooks
#    change, via `docker compose ... up -d --build webhook`).
if ! "${COMPOSE_CMD[@]}" up -d --build --force-recreate --remove-orphans --no-deps backend nginx; then
  rollback "docker compose up failed"
fi

# 3. Prune dangling images older than a week so we can still roll back to
#    recent releases if something goes sideways tomorrow.
docker image prune -f --filter "until=168h" || true

# 4. Real healthcheck: backend must answer /api/v1/healthz with 200.
#    Retries give the backend a few seconds to finish booting.
echo "[$(date -Iseconds)] Healthcheck: ${HEALTHCHECK_URL}"
ATTEMPTS=0
MAX_ATTEMPTS=12
until docker run --rm --network host curlimages/curl:latest \
        curl -sf --connect-timeout 5 --max-time 8 "${HEALTHCHECK_URL}" -o /dev/null; do
  ATTEMPTS=$((ATTEMPTS + 1))
  if [ "${ATTEMPTS}" -ge "${MAX_ATTEMPTS}" ]; then
    echo "[$(date -Iseconds)] Healthcheck did not recover after ${MAX_ATTEMPTS} attempts."
    "${COMPOSE_CMD[@]}" logs --tail=80 backend || true
    rollback "healthcheck failed (${HEALTHCHECK_URL})"
  fi
  sleep 5
done

DEPLOY_END="$(date -Iseconds)"
echo "[${DEPLOY_END}] Deploy finished. ${PREV_SHA} → ${NEW_SHA}"
send_telegram "✅ Nuran deploy OK on $(hostname)
${PREV_SHA:0:7} → ${NEW_SHA:0:7}
Started: ${DEPLOY_START}
Finished: ${DEPLOY_END}"
