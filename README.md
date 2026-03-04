# Nuran - Production Web App

A production-grade web application for managing Projects, Plans, and PlanItems with multi-stage approval workflow.

## Architecture

- **Backend**: Django REST Framework with layered architecture (API → Services → Repositories → Models)
- **Frontend**: React + Vite + TypeScript with Feature-Sliced Design
- **RBAC**: Role-based access control (Admin, Director, Foreman)
- **Audit Logging**: Comprehensive audit trail for all actions

## Features

- **Projects**: Manage projects (Admin/Director only)
- **Plans**: Manage plans within projects (Admin/Director only)
- **Plan Items**: Create and approve plan items with multi-stage workflow
  - Foreman: Can only create (append-only)
  - Director: Can approve from foreman stage
  - Admin: Can approve from director stage and delete
- **Audit Logs**: View all actions (Admin only)
- **Filtering**: Server-side and client-side filtering for plan items

## Setup (local development)

### Backend (local)

```bash
cd backend
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate
pip install -r requirements.txt
python manage.py migrate
python manage.py createsuperuser
python manage.py runserver
```

### Frontend (local)

```bash
cd frontend
pnpm install
pnpm run dev
```

Backend and frontend use `.env` for local config (e.g. `SECRET_KEY`, `DB_*` in backend; `VITE_API_URL` or `VITE_API_BASE` in frontend). `.env` files are gitignored—do not commit them.

## Production deployment (Docker Compose)

1. Copy the example env file and edit values:

```bash
cp .env.example .env
```

2. From the repository root, build and start the stack:

```bash
docker compose -f infra/docker-compose.yml up -d --build
```

This will start:

- **db**: PostgreSQL 16 (`postgres:16-alpine`)
- **redis**: Redis 7 (`redis:7-alpine`)
- **backend**: Django + Gunicorn (no public port, internal only)
- **nginx**: Serves the built frontend SPA and proxies `/api/` to the backend, exposing ports **80** and **443** on the host. With SSL (see below), use HTTPS.

Once running, the app will be available at:

- `http://localhost/` – frontend SPA (or `https://nuranpark.com/` when SSL is configured)
- `http://localhost/api/v1/` – backend API (proxied by nginx)

On the server, clone the repo to `/var/www/nuran` so that webhook-triggered deploys can run `git pull` and `docker compose` there. Make deploy scripts executable: `chmod +x scripts/deploy.sh scripts/deploy-trigger.sh`.

## Auto deploy (GitHub webhook)

A **webhook** service runs inside the stack. It is **not** exposed on a public port; nginx proxies `/hooks/` to it. When GitHub sends a **push** to **main**, it validates the secret and runs a deploy script (pull, rebuild, prune).

### 1. Server setup

- Ensure the repo is at **`/var/www/nuran`** and that `scripts/deploy.sh` and `scripts/deploy-trigger.sh` are executable:
  ```bash
  chmod +x /var/www/nuran/scripts/deploy.sh /var/www/nuran/scripts/deploy-trigger.sh
  ```
- Set **`WEBHOOK_SECRET`** in `.env` (same value you will set in GitHub as the webhook secret).
- Only ports **22**, **80**, and **443** (if using TLS) need to be open. Do **not** open port 9000.

### 2. GitHub webhook

1. Open the repo on GitHub → **Settings** → **Webhooks** → **Add webhook**.
2. **Payload URL**:
   - HTTP: `http://YOUR_SERVER_IP/hooks/deploy`
   - HTTPS (if you use TLS): `https://your-domain/hooks/deploy`  
   (Replace `YOUR_SERVER_IP` or `your-domain` with your server’s public IP or hostname.)
3. **Content type**: `application/json`.
4. **Secret**: Set a strong secret and put the **exact same value** in `.env` as `WEBHOOK_SECRET`.  
   The listener accepts:
   - **GitHub**: `X-Hub-Signature-256` (HMAC-SHA256 of the body with this secret).
   - **Fallback**: custom header `X-Deploy-Token` equal to `WEBHOOK_SECRET` (e.g. for manual or non-GitHub triggers).
5. Under **Which events would you like to trigger this webhook?** choose **Just the push event** (or refine later).
6. Leave **Active** checked and save.

### 3. Test and logs

- After a push to `main`, the webhook runs: `git pull origin main`, then `docker compose -f infra/docker-compose.yml up -d --build`, then `docker image prune -f`. A lock file prevents overlapping deploys.
- For **acceptance tests** (healthz, webhook POST, nginx→webhook, nginx -t/reload), see [scripts/verification.md](scripts/verification.md).
- To watch webhook and deploy logs:
  ```bash
  docker logs -f nuran-webhook-1
  ```
  (Container name may vary, e.g. `nuran-webhook-1` or `nuran_webhook_1` depending on Compose version.)

### Secure webhook mode (recommended)

The webhook service is **not** exposed on a public port. Traffic reaches it only via nginx:

- **GitHub Payload URL**:
  - HTTP: `http://YOUR_SERVER_IP/hooks/deploy`
  - HTTPS (if you use TLS): `https://your-domain/hooks/deploy`
- Only ports **22**, **80**, and **443** need to be open. Do **not** open port 9000.
- nginx proxies `/hooks/` to the internal webhook container; GitHub signature and token headers are preserved.

### 4. Security note (docker.sock)

The webhook container mounts **`/var/run/docker.sock`** so it can run `docker compose` on the host. That gives the container full control of the host’s Docker daemon. A **safer alternative** is to avoid mounting the socket: run a small systemd service on the host that listens only on `127.0.0.1` for deploy requests, and put the webhook behind nginx with auth (or in a private network) so only authenticated callers can trigger the deploy. The current setup uses the straightforward socket approach for simplicity.

## SSL (Let's Encrypt)

HTTPS uses Let's Encrypt with the **webroot** method. Nginx has two modes (no certs required for first run):

- **HTTP mode** (default): `NGINX_CONF_TARGET=http.conf` — serves SPA, API, webhook, and ACME challenge. Use for first run and to obtain certs.
- **SSL mode**: `NGINX_CONF_TARGET=ssl.conf` — HTTP redirects to HTTPS; HTTPS serves the app using certs from `/etc/letsencrypt`.

Only ports **22**, **80**, and **443** need to be open.

### Step-by-step (webroot only)

a) **DNS**: Ensure A records for `nuranpark.com` and `www.nuranpark.com` point to your server IP.

b) **Start stack in HTTP mode** (default):
   ```bash
   docker compose -f infra/docker-compose.yml up -d --build
   ```

c) **Issue certs (webroot)**:
   ```bash
   docker compose -f infra/docker-compose.yml run --rm certbot certonly \
     --webroot -w /var/www/certbot \
     -d nuranpark.com -d www.nuranpark.com \
     --email YOUR_EMAIL \
     --agree-tos --no-eff-email
   ```
   Replace `YOUR_EMAIL` with your email.

d) **Switch nginx to SSL mode**: set `NGINX_CONF_TARGET=ssl.conf` in `.env` (or export it), then recreate nginx so it picks the SSL config:
   ```bash
   # In .env: NGINX_CONF_TARGET=ssl.conf
   docker compose -f infra/docker-compose.yml up -d --build nginx
   docker compose -f infra/docker-compose.yml exec nginx nginx -s reload
   ```
   Or in one go without editing .env:
   ```bash
   NGINX_CONF_TARGET=ssl.conf docker compose -f infra/docker-compose.yml up -d --build nginx
   docker compose -f infra/docker-compose.yml exec nginx nginx -s reload
   ```

e) **Renewal**:
   ```bash
   docker compose -f infra/docker-compose.yml run --rm certbot renew --webroot -w /var/www/certbot
   docker compose -f infra/docker-compose.yml exec nginx nginx -s reload
   ```

f) **Automated renewal (cron)** — daily at 03:00 (run from repo path `/var/www/nuran`):
   ```cron
   0 3 * * * cd /var/www/nuran && docker compose -f infra/docker-compose.yml run --rm certbot renew --webroot -w /var/www/certbot --quiet && docker compose -f infra/docker-compose.yml exec nginx nginx -s reload
   ```

Volumes **letsencrypt** and **certbot_www** are shared by nginx and certbot; nginx serves `/.well-known/acme-challenge/` from `certbot_www` for webroot validation.

## Environment variables

All environment variables are documented in `.env.example`. Key ones:

- **Django**:
  - `SECRET_KEY` – Django secret key
  - `DEBUG` – `0` in production, `1` or `True` for local
  - `ALLOWED_HOSTS` / `DJANGO_ALLOWED_HOSTS` – comma-separated hostnames
  - `DJANGO_CSRF_TRUSTED_ORIGINS` – comma-separated trusted origins
  - `DB_ENGINE`, `DB_NAME`, `DB_USER`, `DB_PASSWORD`, `DB_HOST`, `DB_PORT`
  - `REDIS_URL` – e.g. `redis://redis:6379/0`
- **PostgreSQL container**:
  - `POSTGRES_DB`, `POSTGRES_USER`, `POSTGRES_PASSWORD`
- **Frontend**:
  - `VITE_API_BASE` – usually `/api/v1` behind nginx
  - `VITE_API_URL` – optional absolute URL for local dev (e.g. `http://localhost:8000/api/v1`)
- **CORS**:
  - `CORS_ALLOWED_ORIGINS` – comma-separated list of allowed origins
- **Auto deploy**:
  - `WEBHOOK_SECRET` – secret for webhook auth (GitHub Secret / `X-Deploy-Token`); set in `.env`, do not commit

## Backups

Database backups can be created from the host using:

```bash
./scripts/backup.sh
```

This script:

- Ensures `/var/backups/nuran` exists on the host
- Uses `docker compose -f infra/docker-compose.yml exec -T db pg_dump ... | gzip` to create a timestamped backup
- Keeps only the 7 most recent backups in `/var/backups/nuran`

To restore from a backup (optional helper script):

```bash
./scripts/restore.sh /var/backups/nuran/nuran_YYYYMMDD_HHMMSS.sql.gz
```

The restore script will prompt for confirmation before applying changes.

**Restore test plan (recommended):** Periodically verify backups by running a restore on a staging copy or local clone (e.g. monthly). After restore, confirm the app starts and can read data; this validates retention and dump consistency.

## Testing

### Backend Tests

```bash
cd backend
pytest
```

## API Endpoints

All endpoints are under `/api/v1/`:

- `GET /api/v1/projects/` - List projects (Admin/Director)
- `POST /api/v1/projects/` - Create project (Admin/Director)
- `GET /api/v1/plans/` - List plans (Admin/Director)
- `POST /api/v1/plans/` - Create plan (Admin/Director)
- `GET /api/v1/plan-items/` - List plan items (All authenticated)
- `POST /api/v1/plan-items/` - Create plan item (Foreman/Director/Admin)
- `PATCH /api/v1/plan-items/{id}/` - Update plan item (Director/Admin)
- `POST /api/v1/plan-items/{id}/approve/` - Approve plan item (Director/Admin)
- `DELETE /api/v1/plan-items/{id}/` - Delete plan item (Admin)
- `GET /api/v1/audit-logs/` - List audit logs (Admin)
- `POST /api/v1/auth/login/` - Login
- `POST /api/v1/auth/logout/` - Logout
- `GET /api/v1/auth/user/` - Get current user

## RBAC Rules

- **Admin**: Full access to all resources
- **Director**: Can manage projects, plans, and approve plan items
- **Foreman**: Can only create plan items (no update/delete)

## Approval Workflow

1. Foreman creates PlanItem → `status: pending`, `approval_stage: foreman`
2. Director approves → `status: pending`, `approval_stage: director`
3. Admin approves → `status: approved`, `approval_stage: admin`

## Project Structure

```
backend/
├── apps/
│   ├── users/          # User model and auth
│   ├── projects/       # Project app
│   ├── plans/         # Plan app
│   ├── plan_items/    # PlanItem app
│   └── audit/         # Audit logging
├── core/              # Core permissions and exceptions
└── config/            # Django settings

frontend/
├── src/
│   ├── app/           # App setup and routing
│   ├── pages/         # Page components
│   ├── features/      # Feature components
│   ├── entities/      # Entity models and API clients
│   ├── widgets/       # Widget components
│   └── shared/        # Shared utilities and UI
```

