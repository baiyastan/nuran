FROM alpine:3.20

ARG WEBHOOK_VERSION=2.8.1

RUN apk add --no-cache \
    bash \
    ca-certificates \
    curl \
    git \
    docker-cli \
    docker-cli-compose \
    tar \
    libc6-compat \
    gcompat

RUN set -eux; \
    curl -L -o /tmp/webhook.tar.gz \
      "https://github.com/adnanh/webhook/releases/download/${WEBHOOK_VERSION}/webhook-linux-amd64.tar.gz"; \
    mkdir -p /tmp/webhook-extract; \
    tar -xzf /tmp/webhook.tar.gz -C /tmp/webhook-extract; \
    BIN_PATH="$(find /tmp/webhook-extract -type f -maxdepth 3 -name 'webhook' | head -n 1)"; \
    echo "Found binary: ${BIN_PATH}"; \
    install -m 0755 "${BIN_PATH}" /usr/local/bin/webhook; \
    /usr/local/bin/webhook -help >/dev/null 2>&1 || true; \
    rm -rf /tmp/webhook.tar.gz /tmp/webhook-extract

EXPOSE 9000
ENTRYPOINT ["/usr/local/bin/webhook"]
