#!/bin/sh
# Select nginx config by NGINX_CONF_TARGET (http.conf or ssl.conf), then run nginx.
set -e
TARGET="${NGINX_CONF_TARGET:-http.conf}"
cp "/etc/nginx/conf.d/${TARGET}" /etc/nginx/conf.d/default.conf
exec nginx -g 'daemon off;'
