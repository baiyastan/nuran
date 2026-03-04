#!/bin/sh
set -eu

REPO_ROOT="${REPO_ROOT:-/var/www/nuran}"
LOG_FILE="${REPO_ROOT}/scripts/.deploy-trigger.log"

log() { echo "[$(date '+%Y-%m-%dT%H:%M:%S%z')] $*" >> "${LOG_FILE}"; }

if [ -z "${WEBHOOK_SECRET:-}" ]; then
  log "ERROR: WEBHOOK_SECRET not set"
  echo "WEBHOOK_SECRET not set" >&2
  exit 1
fi

if [ -z "${HTTP_X_HUB_SIGNATURE_256:-}" ]; then
  log "ERROR: Missing X-Hub-Signature-256 (403)"
  echo "Missing X-Hub-Signature-256" >&2
  exit 1
fi

# $1 = raw request body (pass-arguments-to-command raw-request-body)
RAW="${1:-}"
EXPECTED_HEX=$(printf '%s' "${RAW}" | openssl dgst -sha256 -hmac "${WEBHOOK_SECRET}" -hex | awk '{print $2}')
EXPECTED="sha256=${EXPECTED_HEX}"

if [ "${HTTP_X_HUB_SIGNATURE_256}" != "${EXPECTED}" ]; then
  log "ERROR: Invalid X-Hub-Signature-256 (403)"
  echo "Invalid X-Hub-Signature-256" >&2
  exit 1
fi

log "Trigger: signature valid, executing deploy"
exec /var/www/nuran/scripts/deploy.sh
