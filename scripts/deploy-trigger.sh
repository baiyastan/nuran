#!/bin/sh
# Validates webhook secret (X-Hub-Signature-256 or X-Deploy-Token) then runs deploy.sh.
# Expects raw request body as first argument when using GitHub (for HMAC verification).
set -eu

if [ -z "${WEBHOOK_SECRET:-}" ]; then
  echo "WEBHOOK_SECRET not set" >&2
  exit 1
fi

# GitHub: verify X-Hub-Signature-256 (HMAC-SHA256 of body with WEBHOOK_SECRET)
if [ -n "${HTTP_X_HUB_SIGNATURE_256:-}" ]; then
  if [ -z "${1:-}" ]; then
    echo "Missing request body for signature verification" >&2
    exit 1
  fi
  want="${HTTP_X_HUB_SIGNATURE_256#sha256=}"
  got=$(printf '%s' "$1" | openssl dgst -sha256 -hmac "$WEBHOOK_SECRET" | awk '{print $2}')
  if [ -z "$want" ] || [ "$got" != "$want" ]; then
    echo "Invalid X-Hub-Signature-256" >&2
    exit 1
  fi
  # Trigger rule already filters refs/heads/main; no need to parse JSON here
  exec /var/www/nuran/scripts/deploy.sh
fi

# Fallback: custom header X-Deploy-Token (e.g. for non-GitHub or testing)
if [ -n "${HTTP_X_DEPLOY_TOKEN:-}" ]; then
  if [ "$HTTP_X_DEPLOY_TOKEN" != "$WEBHOOK_SECRET" ]; then
    echo "Invalid X-Deploy-Token" >&2
    exit 1
  fi
  exec /var/www/nuran/scripts/deploy.sh
fi

echo "Missing X-Hub-Signature-256 or X-Deploy-Token" >&2
exit 1
