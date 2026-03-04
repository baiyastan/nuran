#!/bin/sh
set -eu

if [ -z "${WEBHOOK_SECRET:-}" ]; then
  echo "WEBHOOK_SECRET not set" >&2
  exit 1
fi

if [ -n "${HTTP_X_DEPLOY_TOKEN:-}" ]; then
  if [ "$HTTP_X_DEPLOY_TOKEN" != "$WEBHOOK_SECRET" ]; then
    echo "Invalid X-Deploy-Token" >&2
    exit 1
  fi

  exec /var/www/nuran/scripts/deploy.sh
fi

echo "Missing X-Deploy-Token" >&2
exit 1
