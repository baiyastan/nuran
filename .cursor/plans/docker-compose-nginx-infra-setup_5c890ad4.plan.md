---
name: docker-compose-nginx-infra-setup
overview: Design and implement Docker Compose + Nginx-based production deployment for the Django + Vite monorepo with Postgres, Redis, backups, and documented env variables.
todos: []
isProject: false
---

## Docker + Nginx infra plan for `nuran`

### High-level architecture

Use Docker Compose v2 to run all services on a single Ubuntu host, fronted by Nginx serving the built React SPA and proxying API traffic to Django (gunicorn):

```mermaid
flowchart LR
  client[Browser] --> nginx
  nginx -->|"/" (SPA static)| spaStatic
  nginx -->|"/api/"| backend
  nginx -->|"/static/" (optional)| backend
  backend --> db
  backend --> redis
```



- **Services:**
  - `db`: Postgres, with persistent volume + backup mount.
  - `redis`: Redis, simple cache/broker, optional data volume.
  - `backend`: Django app served via gunicorn, configured via env.
  - `nginx`: Nginx image that embeds built frontend static files and proxies `/api/` to `backend:8000`.
- **Env config:** Single root `.env` (not committed, only `.env.example` is tracked). Compose reads from this for all services.

---

### 1. Infra layout and Compose file

**New directories/files:**

- `[infra/docker-compose.yml](infra/docker-compose.yml)`
- `[infra/docker/backend.Dockerfile](infra/docker/backend.Dockerfile)`
- `[infra/docker/frontend.Dockerfile](infra/docker/frontend.Dockerfile)` (multi-stage: build + nginx)
- `[infra/docker/nginx.conf](infra/docker/nginx.conf)`
- `[scripts/backup.sh](scripts/backup.sh)` (+ optional `[scripts/restore.sh](scripts/restore.sh)`)
- `[.env.example](.env.example)` at repo root

`**infra/docker-compose.yml` – design:**

- Define services:
  - **db**
    - `image: postgres:16-alpine`
    - `environment`: `POSTGRES_DB`, `POSTGRES_USER`, `POSTGRES_PASSWORD` (from root `.env`).
    - `volumes`:
      - `postgres_data:/var/lib/postgresql/data`
      - `/var/backups/nuran:/backups` (host path; used by backup script via container mount).
    - `healthcheck`: `CMD-SHELL: pg_isready -U "$${POSTGRES_USER}" -d "$${POSTGRES_DB}" || exit 1`.
  - **redis**
    - `image: redis:7-alpine`
    - optional `volumes: redis_data:/data` if you want persistence.
    - `command: ["redis-server", "--appendonly", "yes"]` if persistence is desired.
    - simple `healthcheck`: `CMD-SHELL: redis-cli ping || exit 1`.
  - **backend**
    - `build`:
      - `context: ..` (repo root)
      - `dockerfile: infra/docker/backend.Dockerfile`
    - `env_file: ../.env` or `env_file: .env` from compose’s directory, depending on where you place it (plan assumes root `.env` and `env_file: ../.env`).
    - `depends_on`: `db`, `redis` (with `condition: service_healthy` if you use Compose v2 healthcheck conditions).
    - `command`: gunicorn entrypoint (e.g. `gunicorn config.wsgi:application --bind 0.0.0.0:8000`).
    - `ports`: normally not exposed publicly (Nginx will talk to it on the Docker network only), but you may optionally expose `8000` for debugging.
    - `healthcheck`: `curl -f http://localhost:8000/ || exit 1` (or a dedicated `/health/` endpoint if you add one later).
  - **nginx**
    - `build`:
      - `context: ..`
      - `dockerfile: infra/docker/frontend.Dockerfile` (final stage is `FROM nginx` with built SPA copied into `/usr/share/nginx/html` and `nginx.conf` into `/etc/nginx/conf.d/default.conf`).
    - `depends_on: backend` (optionally `condition: service_healthy`).
    - `ports`:
      - `80:80`
      - (Later for TLS/Let’s Encrypt you can also expose `443`, but that’s out of scope here.)
    - `volumes` (optional): mount Nginx logs or custom error pages if needed.
- Define `volumes` section:
  - `postgres_data: {}`
  - `redis_data: {}` (if used)

The compose file will be run as:

```bash
cd nuran
docker compose -f infra/docker-compose.yml up -d --build
```

---

### 2. Backend container and Django settings

`**infra/docker/backend.Dockerfile` – design:**

- Base: `python:3.12-slim` (or matching your current Python version).
- Steps:
  - `WORKDIR /app`
  - Install system deps (e.g. `build-essential`, `libpq-dev`) required for PostgreSQL driver.
  - Copy `backend/requirements.txt` and `pip install --no-cache-dir -r backend/requirements.txt`.
  - Copy the entire `backend/` directory into image, preserving `manage.py` and `config/`.
  - Set `ENV PYTHONUNBUFFERED=1`.
  - `CMD` uses a shell wrapper that runs:
    - `python manage.py migrate --noinput`
    - `python manage.py collectstatic --noinput` (requires `STATIC_ROOT` in settings; see below).
    - `gunicorn config.wsgi:application --bind 0.0.0.0:8000 --workers 3`.

**Adjustments to `[backend/config/settings.py](backend/config/settings.py)`:**

- **Allowed hosts & debug:**
  - Keep `SECRET_KEY` and `DEBUG` env-based as-is.
  - Add `DJANGO_ALLOWED_HOSTS` and `DJANGO_CSRF_TRUSTED_ORIGINS` support:
    - Replace current `ALLOWED_HOSTS` line with something like:
      - `ALLOWED_HOSTS = os.environ.get('DJANGO_ALLOWED_HOSTS', '').split(',') if os.environ.get('DJANGO_ALLOWED_HOSTS') else []`
    - Add `CSRF_TRUSTED_ORIGINS` using comma-separated env var:
      - `CSRF_TRUSTED_ORIGINS = os.environ.get('DJANGO_CSRF_TRUSTED_ORIGINS', '').split(',') if os.environ.get('DJANGO_CSRF_TRUSTED_ORIGINS') else []`
    - For `nuranpark.com`, the env example will use `DJANGO_ALLOWED_HOSTS=nuranpark.com` and `DJANGO_CSRF_TRUSTED_ORIGINS=https://nuranpark.com`.
- **Database config (reuse existing pattern):**
  - Keep `db_engine = os.environ.get('DB_ENGINE', 'sqlite3')` and the `if db_engine == 'postgresql'` block.
  - In `.env.example` for production, set:
    - `DB_ENGINE=postgresql`
    - `DB_NAME=nuran`
    - `DB_USER=nuran`
    - `DB_PASSWORD=changeme` (placeholder)
    - `DB_HOST=db`
    - `DB_PORT=5432`
  - This works without changing the Django DB code; Compose injects these env vars into `backend`.
- **Redis cache / broker:**
  - Add a `REDIS_URL` env var with default pointing to the Docker service name:
    - `REDIS_URL = os.environ.get('REDIS_URL', 'redis://redis:6379/0')`
  - Add a simple cache config using `django-redis` if already in requirements (if not, the implementation step will add it):
    - `CACHES = {"default": {"BACKEND": "django_redis.cache.RedisCache", "LOCATION": REDIS_URL, "OPTIONS": {"CLIENT_CLASS": "django_redis.client.DefaultClient"}}}`
  - Optionally set `CELERY_BROKER_URL = os.environ.get('CELERY_BROKER_URL', REDIS_URL)` for future Celery use (no other Celery wiring needed now).
- **Static files:**
  - Update static config to support `collectstatic` in Docker:
    - `STATIC_URL = '/static/'`
    - `STATIC_ROOT = BASE_DIR / 'staticfiles'`
  - Optionally define `MEDIA_URL` and `MEDIA_ROOT` for future file uploads:
    - `MEDIA_URL = '/media/'`
    - `MEDIA_ROOT = BASE_DIR / 'media'`
- **CORS:**
  - Current `CORS_ALLOWED_ORIGINS` is hard-coded to localhost ports. For production:
    - Keep those defaults for dev.
    - Extend with env-driven origins, e.g. `CORS_ALLOWED_ORIGINS += os.environ.get('CORS_ALLOWED_ORIGINS', '').split(',')` (filtering empties), so you can add `https://nuranpark.com` from `.env` without code changes later.

These changes keep local dev working (SQLite when `DB_ENGINE` is default) while enabling Postgres/Redis in containers via env.

---

### 3. Frontend build + Nginx image and config

`**infra/docker/frontend.Dockerfile` – design (multi-stage):**

- **Stage 1 – build (Node):**
  - `FROM node:20-alpine AS build`
  - `WORKDIR /app`
  - Copy `frontend/package.json`, lockfile, and `pnpm` setup; run `pnpm install --frozen-lockfile`.
  - Copy `frontend/` source and run `pnpm run build` with `VITE_API_BASE` coming from build args/env (Compose can pass `VITE_API_BASE=/api/v1`).
  - Build outputs to `/app/dist`.
- **Stage 2 – nginx (final):**
  - `FROM nginx:1.27-alpine`
  - Copy `infra/docker/nginx.conf` to `/etc/nginx/conf.d/default.conf`.
  - Copy built SPA from stage1: `COPY --from=build /app/dist /usr/share/nginx/html`.
  - Optionally adjust Nginx log levels for minimal logging.

The Compose `nginx` service will use this Dockerfile and expose port 80.

`**infra/docker/nginx.conf` – routing rules:**

- Single `server` block for `nuranpark.com` (and `listen 80;`):
  - `root /usr/share/nginx/html;` for SPA assets.
  - `location /api/ {`:
    - `proxy_pass http://backend:8000;`
    - Set `proxy_set_header Host $host;` and `X-Real-IP`, etc.
    - Optionally adjust timeouts.
  - `location /static/ {` (optional):
    - Either serve from a mounted static volume or proxy to backend; simplest initial approach: `proxy_pass http://backend:8000;` so Django serves static/admin files.
  - **SPA routing:**
    - `location / { try_files $uri /index.html; }` so unknown client-side routes fall back to `index.html` and React Router works.

Nginx will be the public-facing entrypoint mapping `/` to the SPA and `/api/` to Django.

---

### 4. Environment variables and `.env.example`

**New file:** `[.env.example](.env.example)` at repo root.

- Include placeholders and comments, no real secrets:
  - **Django core:**
    - `SECRET_KEY=django-insecure-change-this-in-production`
    - `DEBUG=0`
    - `DJANGO_ALLOWED_HOSTS=nuranpark.com`
    - `DJANGO_CSRF_TRUSTED_ORIGINS=https://nuranpark.com`
  - **Database (matches current settings.py):**
    - `DB_ENGINE=postgresql`
    - `DB_NAME=nuran`
    - `DB_USER=nuran`
    - `DB_PASSWORD=change-me-strong`
    - `DB_HOST=db`
    - `DB_PORT=5432`
  - **Redis / Celery:**
    - `REDIS_URL=redis://redis:6379/0`
    - `CELERY_BROKER_URL=redis://redis:6379/1` (optional, for later).
  - **Frontend build-time:**
    - `VITE_API_BASE=/api/v1`
  - **CORS optional:**
    - `CORS_ALLOWED_ORIGINS=https://nuranpark.com`

**Git ignore:** root `.gitignore` already ignores `.env`* and does **not** ignore `.env.example`, so we keep that convention.

---

### 5. Frontend API base configuration

**Target file:** `[frontend/src/shared/api/axiosInstance.ts](frontend/src/shared/api/axiosInstance.ts)`.

Current code:

- `baseURL: import.meta.env.VITE_API_URL || 'http://localhost:8000/api/v1'`

Planned change:

- Use `VITE_API_BASE` as the primary env var, with a safe default for production behind Nginx, while keeping compatibility with existing `VITE_API_URL` in dev:
  - Compute base as: `const baseURL = import.meta.env.VITE_API_BASE ?? import.meta.env.VITE_API_URL ?? '/api/v1'`.
  - Use that in axios instance: `baseURL: baseURL`.

Effects:

- **Local dev:** you can still set `VITE_API_URL=http://localhost:8000/api/v1` in `frontend/.env` as before.
- **Production:** with no `VITE_API_URL` but `VITE_API_BASE=/api/v1`, the SPA will call `/api/v1/...` relative to `https://nuranpark.com`, which Nginx proxies to backend.

---

### 6. Backup and restore scripts

**New file:** `[scripts/backup.sh](scripts/backup.sh)`.

Design:

- Bash script intended to be run on the **host**, from repo root.
- Steps:
  1. Source `./.env` if present to load `POSTGRES_DB`/`POSTGRES_USER` (or reuse `DB_NAME`/`DB_USER` and map them to `POSTGRES_`* in compose env).
  2. Ensure backup dir exists: `/var/backups/nuran`.
  3. Use `docker compose -f infra/docker-compose.yml exec -T db pg_dump -U "$POSTGRES_USER" "$POSTGRES_DB" | gzip > /var/backups/nuran/nuran-YYYYmmdd-HHMMSS.sql.gz`.
  4. Rotate backups: keep last 7 files, delete older with `ls -1t` + `tail -n +8`.

**Optional new file:** `[scripts/restore.sh](scripts/restore.sh)`.

Design:

- Bash script that:
  - Accepts a filename (e.g. `nuran-2026-03-02-120000.sql.gz`).
  - Uses `gunzip -c` and `docker compose -f infra/docker-compose.yml exec -T db psql -U "$POSTGRES_USER" "$POSTGRES_DB"` to restore into Postgres (after confirmation/prompt).

This satisfies the requirement for backup to `/var/backups/nuran` on the host, using the db container mount.

---

### 7. README updates (local + deploy)

**Target file:** `[README.md](README.md)`.

Add or adjust sections (without rewriting everything):

- **Local development:**
  - Backend:
    - `cd backend`
    - `python -m venv .venv`
    - `source .venv/bin/activate`
    - `pip install -r requirements.txt`
    - `python manage.py migrate`
    - `python manage.py runserver`
  - Frontend:
    - `cd frontend`
    - `pnpm install`
    - `pnpm run dev`
  - Note that local backend may still use SQLite by default (`DB_ENGINE` omitted), and frontend can point at `http://localhost:8000/api/v1` via `VITE_API_URL` in `frontend/.env`.
- **Production deployment (Docker on Ubuntu):**
  - On the server (`157.230.124.195`):
    - Install Docker Engine + docker compose plugin.
    - Clone the repo: `git clone https://github.com/<you>/nuran.git && cd nuran`.
    - Create `.env` from example: `cp .env.example .env` and fill in strong secrets and DB credentials.
    - Run: `docker compose -f infra/docker-compose.yml up -d --build`.
    - Confirm services: `docker compose -f infra/docker-compose.yml ps`.
  - Briefly document where app is reachable (`http://nuranpark.com` once DNS is pointed to the server IP) and that Nginx listens on port 80 in the `nginx` service.
- **Environment variables reference:**
  - List and briefly describe the main variables from `.env.example` so users know what to set.

---

### 8. Post-change checks and commands

After implementing the above changes, run these checks:

- **Frontend build still works:**

```bash
  cd frontend
  pnpm install
  pnpm run build
  

```

- **Backend migrations run:**

```bash
  cd backend
  python -m venv .venv
  source .venv/bin/activate
  pip install -r requirements.txt
  python manage.py migrate
  

```

- **Docker deployment (local or on server):**

```bash
  cd nuran
  docker compose -f infra/docker-compose.yml up -d --build
  docker compose -f infra/docker-compose.yml ps
  

```

- **Check Nginx routing (from host):**

```bash
  curl -I http://localhost/            # should return 200 and serve index.html
  curl -I http://localhost/api/v1/     # should proxy to backend (may be 200/401 depending on auth)
  

```

- **Backups:**

```bash
  cd nuran
  chmod +x scripts/backup.sh
  ./scripts/backup.sh
  ls -1 /var/backups/nuran
  

```

- **Restore test (optional, on a non-prod DB):**

```bash
  ./scripts/restore.sh /var/backups/nuran/<some-backup-file>.sql.gz
  

```

This plan keeps the implementation minimal and aligned with your existing `settings.py` patterns while introducing a production-ready Docker + Nginx stack, environment-driven configuration, and backup tooling.