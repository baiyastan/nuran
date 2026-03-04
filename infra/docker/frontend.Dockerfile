# ---------- Builder stage ----------
FROM node:20-alpine AS builder

WORKDIR /app

# Enable pnpm
RUN corepack enable && corepack prepare pnpm@latest --activate

# Copy only frontend manifests first (better caching)
COPY frontend/package.json frontend/pnpm-lock.yaml ./frontend/
WORKDIR /app/frontend

# Install deps in the SAME folder where we build
RUN pnpm install --frozen-lockfile --prod=false

# Copy frontend source
COPY frontend ./

# Build SPA
RUN pnpm run build


# ---------- Nginx stage ----------
FROM nginx:alpine

COPY --from=builder /app/frontend/dist /usr/share/nginx/html

# IMPORTANT: put configs OUTSIDE conf.d, otherwise nginx loads both
RUN mkdir -p /etc/nginx/templates
COPY infra/docker/nginx-rate-limit.conf /etc/nginx/templates/00-rate-limit.conf
COPY infra/docker/nginx.http.conf /etc/nginx/templates/http.conf
COPY infra/docker/nginx.ssl.conf  /etc/nginx/templates/ssl.conf

COPY infra/docker/nginx-entrypoint.sh /nginx-entrypoint.sh
RUN chmod +x /nginx-entrypoint.sh

EXPOSE 80 443
ENTRYPOINT ["/nginx-entrypoint.sh"]