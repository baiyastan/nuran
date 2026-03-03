#!/bin/sh
set -e

TARGET="${NGINX_CONF_TARGET:-http.conf}"
echo "[entrypoint] NGINX_CONF_TARGET=$TARGET"

# SSL суралса, бирок cert жок болсо http'ко түш
if [ "$TARGET" = "ssl.conf" ]; then
  if [ ! -f "/etc/letsencrypt/live/nuranpark.com/fullchain.pem" ] || \
     [ ! -f "/etc/letsencrypt/live/nuranpark.com/privkey.pem" ]; then
    echo "[entrypoint] SSL cert not found, falling back to http.conf"
    TARGET="http.conf"
  fi
fi

# conf.d ичинде бир гана файл болсун
rm -f /etc/nginx/conf.d/*

# TEMPLATE ПАПКАДАН көчүрөбүз
cp "/etc/nginx/templates/$TARGET" /etc/nginx/conf.d/default.conf

nginx -t
exec nginx -g "daemon off;"
