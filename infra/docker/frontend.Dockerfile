FROM node:20-alpine AS builder

WORKDIR /app

# Install pnpm
RUN corepack enable && corepack prepare pnpm@latest --activate

# Install dependencies (layered for better caching)
COPY frontend/package.json frontend/pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

# Copy frontend source and build
COPY frontend ./frontend
WORKDIR /app/frontend
RUN pnpm run build


FROM nginx:alpine

# Config selection at runtime via NGINX_CONF_TARGET (http.conf or ssl.conf)
COPY infra/docker/nginx.http.conf /etc/nginx/conf.d/http.conf
COPY infra/docker/nginx.ssl.conf /etc/nginx/conf.d/ssl.conf
COPY infra/docker/nginx-entrypoint.sh /nginx-entrypoint.sh
RUN chmod +x /nginx-entrypoint.sh

# Copy built frontend assets
COPY --from=builder /app/frontend/dist /usr/share/nginx/html

ENTRYPOINT ["/nginx-entrypoint.sh"]

EXPOSE 80 443

