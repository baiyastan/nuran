#!/bin/sh
set -eu

REPO_ROOT="${REPO_ROOT:-/var/www/nuran}"
LOG_FILE="${REPO_ROOT}/.deploy-trigger.log"

log() { echo "[$(date '+%Y-%m-%dT%H:%M:%S%z')] $*" >> "${LOG_FILE}"; }

if [ -z "${WEBHOOK_SECRET:-}" ]; then
  log "ERROR: WEBHOOK_SECRET not set"
  echo "WEBHOOK_SECRET not set" >&2
  exit 1
fi

if [ -n "${HTTP_X_DEPLOY_TOKEN:-}" ]; then
  if [ "$HTTP_X_DEPLOY_TOKEN" != "$WEBHOOK_SECRET" ]; then
    log "ERROR: Invalid X-Deploy-Token"
    echo "Invalid X-Deploy-Token" >&2
    exit 1
  fi

  log "Trigger: token present, executing deploy"
  exec /var/www/nuran/scripts/deploy.sh
fi

log "ERROR: Missing X-Deploy-Token"
echo "Missing X-Deploy-Token" >&2
exit 1
